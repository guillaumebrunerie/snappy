A library for reactive state, with efficient support for selectors and immutable
snapshots. Experiment to see if I can get a more efficient alternative to Redux
for a large scale project with many selectors and many actions dispatched.

**⚠️ Very much work in progress, don’t believe anything here! ⚠️**

Features
========

- **Fast and memory efficient**: built on ES6 proxies in such a way that no
  deep cloning/deep comparison is needed (except once during initial setup)
- **Snapshots**: take snapshots of reactive state in an efficient way, makes it
  easy to implement undo/redo
- **Subscriptions and selectors**: get notified when a derived value changes,
  makes it easy to implement a `useSelector` hook similar to Redux (but more
  efficient and with built-in memoization).

Advantages over Redux
=====================

- Selectors are automatically "memoized", in a way that supports dynamic
  dependencies. So for instance if you have a selector of the form `state =>
  state.values[state.key]`, there is no way to memoize it properly in Redux (as
  depending on the value of `state.key` it could depend on anything in
  `state.values`), but here dynamic dependencies make it work as expected.
- With Redux, all selectors run again after each dispatch, which can add up if
  you have thousands of selectors and dispatching actions at every mouse move
  (although to be fair, Redux still manages to be extremely efficient).

Good to know
============

- Only plain Javascript objects, arrays, and primitive types are supported.
- Circular objects or objects with duplicate references are not supported (but
  snapshots make heavy use of duplicate references to stay memory-efficient even
  with a very large state).

Basic primitives
================

* `makeReactive: <T extends object>(obj: T) => Reactive<T>`: Turns an object
  into a special kind of object (based on ES6 proxies) that will track changes
  and make sure the snapshots are up to date and that subscriptions are updated.
  You should always only modify the reactive object and never the initial
  object.

* `takeSnapshot: (value: unknown) => Snapshot<T>`: Takes an immutable snapshot
  of a reactive object. It will deeply clone the object the first time it is
  called, but all subsequent times it will shallow clone as little as possible
  to create a new snapshot, based on what changed since the previous snapshot.
  Snapshots themselves can be stored in a reactive object and will then be
  treated specially, in particular snapshotting them will return the same
  reference and not a copy and they will not be deep cloned again as they are
  immutable.

* `applySnapshot: <T>(obj: Reactive<T>, snapshot: Snapshot<T>) => void`: Given a
  reactive object and an (old) snapshot of that object, do all the necessary
  changes on the wrapped object to revert to the old snapshot. Only the parts
  that actually differ will be modified.

* `subscribe: <T>(robj: Reactive, selector: (robj: Reactive) => T, callback: (t:
  T) => void): T`: Given a reactive object, a selector, and a callback, first
  returns the result of applying the selector on the reactive object, but also
  register the callback at the parts of the reactive object that were accessed.
  Whenever modifying a part of the reactive object that was accessed in a
  subscription, mark the callback as dirty so that a call to `notifySubscribers`
  will invoke it.

* `applyChange: (robj: Reactive, change: (robj: Reactive) => void) => void`:
  Apply the function on the reactive object, and then call all callbacks that
  accessed some parts of it that were changed.


Undo/redo
=========

You can easily implement undo/redo using snapshots (assuming you have a global
state which is a reactive object):

* Whenever the user does something, take a snapshot of the state and store it
  somewhere. Note that taking repeated snapshots is very efficient when not much
  changed from one state to the other, as it will reuse old snapshots for the
  parts of the state that were not touched.

* Whenever the user wants to undo/redo, use the `applySnapshot` function to
  apply the snapshot onto the state. It will only change the parts that actually
  differ, so it will only affect the subscriptions that are actually affected.

Redux-like interface
====================

You can get a Redux-like interface replacing Redux' immutable state by a
reactive object.

* Reducers simply mutate the reactive object via `applyChange`.
* Selectors can be implemented using `subscribe` and `useSyncExternalStore`. You
  should also make sure to return a snapshot of the resulting object, otherwise
  you will not be notified if nested properties are changed.
