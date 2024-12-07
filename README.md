A library for taking immutable snapshots of mutable state, with all the
necessary building blocks to implement undo-redo functionality in a
SolidJS/VanillaJS application.

Features
========

- **Very fast and memory efficient**: built on ES6 proxies in such a way that no
  deep cloning/deep comparison is needed (except once during initial setup)
- **Very flexible**: you can choose when to take a snapshot, where to store
  them, when to restore them, etc.
- Compatible with SolidJS stores and VanillaJS
- Supports multiple undo areas (for instance you are making a rich text editor
  and you want each document to have its own undo history)
- Supports tagging snapshots with metadata, to get a meaningful undo history
- You can either use only the basic primitives to build your own undo system,
  or use the ready made undo/redo utilities

Good to know
============

- Only plain Javascript objects, arrays, and primitive types are supported
- Circular objects or objects with duplicate references are not supported (but
  snapshots and undo/redo make heavy use of duplicate references to stay
  memory-efficient even with a very large state).

Basic primitives
================

`Wrapped<T>`: Return type of the `wrap` function.

`wrap: <T extends object>(obj: T) => Wrapped<T>`: Turns an object into a special
kind of object that will track changes and make sure the snapshots are up to
date. In order for snapshotting to work, you should only modify the wrapped
object and never the initial object.

`DeepReadonly<T>`: Return type of the `snapshot` function, snapshots are read
only.

`snapshot: <T>(obj: Wrapped<T>) => DeepReadonly<T>`: Takes a snapshot of the
wrapped object. It will deeply clone the object the first time it is called, but
all subsequent times it will shallow clone as little as possible to create a new
snapshot, based on what changed since the previous snapshot. Snapshots can be
stored in a wrapped object and they will then be treated specially, in
particular snapshotting them will return the same reference and not a copy.

`applySnapshot: <T>(obj: Wrapped<T>, snap: DeepReadOnly<T>) => void`: Given a
wrapped object and an (old) snapshot of that object, do all the necessary
changes on the wrapped object to revert to the old snapshot. Only the parts that
actually differ will be modified.


Undo/redo utilities
===================

`Undoable<T, M>`: Type `T` with undo/redo support.

`pushCurrentToUndoStack: (state: Undoable<T, M>, meta: M, historySize = 100) => void`:
Push a snapshot of the current state to the undo stack, together with arbitrary
metadata of your choice. It deletes all redo information. You should call this
function right before making a change that you want to be undoable.

`doUndo: (state: Undoable<T, M>, steps = 1) => void`: Performs undo.

`doRedo: (state: Undoable<T, M>, steps = 1) => void`: Performs redo.

`initialUndoableState: (initialState: T) => Undoable<T, M>`: Creates an initial
state.

`getCurrentState: (state: Undoable<T, M>) => T`: Returns the current state

`getUndoStack: (state: Undoable<T, M>) => M[]`: Returns all metadata for the
undo stack.

`getRedoStack: (state: Undoable<T, M>) => M[]`: Returns all metadata for the
redo stack.

Usage
=====

Let's say that you have an object of type `T` for which you wish to enable
undo/redo. Follow those steps:

- Instead of using an object of type `T`, pass it to `initialUndoableState` to
  create an object of type `UndoableState<T, M>`.
- If you want to read the current value of the object, use
  `getCurrentState`.
- If you want to modify the value of the object *without saving the current
  state as an undo step*, simply modify the object returned by `getCurrentState`
- If you want to modify the value of the object *while saving the current
  state as an undo step*, call `pushCurrentToUndoStack` first and then modify
  the object returned by `getCurrentState`. You can optionally pass some
  metadata if you want for instance to show a undo history to the user
  somewhere.
- If you want to undo/redo, call `doUndo`, `doRedo`, or `doUndoRedo`.
- If you want to inspect the undo/redo stack, use `getUndoStack` or
  `getRedoStack`.
