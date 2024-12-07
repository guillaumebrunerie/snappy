import { expect, it } from "vitest";
import {applyOldSnapshot, proxy, snapshot} from "./snapshots.js";

it("snapshots a basic object", () => {
	const object = proxy({a: 0});
	const snap1 = snapshot(object);
	object.a = 2;
	const snap2 = snapshot(object);
	expect(snap1).toEqual({a: 0});
	expect(snap2).toEqual({a: 2});
});

it("snapshots a complex object", () => {
	const object = proxy({a: {b: 0}, c: {d: 1}});
	const snap1 = snapshot(object);
	object.a.b = 2;
	const snap2 = snapshot(object);
	expect(snap1).toEqual({a: {b: 0}, c: {d: 1}});
	expect(snap2).toEqual({a: {b: 2}, c: {d: 1}});
});

it("returns the same snapshot for untouched parts", () => {
	const object = proxy({a: {b: 0}, c: {d: 1}});
	const snap1 = snapshot(object);
	object.a.b = 2;
	const snap2 = snapshot(object);
	expect(snap1.c).toBe(snap2.c);
});

it("supports arrays", () => {
	const object = proxy([1]);
	const snap1 = snapshot(object);
	object.push(3);
	const snap2 = snapshot(object);
	expect(snap1).toEqual([1]);
	expect(snap2).toEqual([1, 3]);
});

it("supports deleting properties", () => {
	const object = proxy({a: 0, b: 3});
	const snap1 = snapshot(object);
	delete object.a;
	const snap2 = snapshot(object);
	expect(snap1).toEqual({a: 0, b: 3});
	expect(snap2).toEqual({b: 3});
});

it("supports storing snapshots", () => {
	const baseObject = {current: {a: 0, b: {c: 0}}, previous: []};
	const object = proxy(baseObject);
	object.previous.push(snapshot(object.current));
	object.current.a = 1;
	object.previous.push(snapshot(object.current));
	object.current.a = 2;
	const snap = snapshot(object);
	const expected = {
		current: {a: 2, b: {c: 0}},
		previous: [{a: 0, b: {c: 0}}, {a: 1, b: {c: 0}}],
	};
	expect(snap).toEqual(expected);
	expect(baseObject.previous[0].b).toBe(baseObject.previous[1].b);
	expect(snap.previous[0].b).toBe(snap.previous[1].b);
});

it("supports restoring snapshots", () => {
	const baseObject = {current: {a: 0, b: {c: 0}, d: {e: 0}}, previous: null};
	const object = proxy(baseObject);
	object.current.a = 1;
	object.previous = snapshot(object.current);
	object.current.b.c = 2;
	expect(snapshot(object)).toEqual({
		current: {a: 1, b: {c: 2}, d: {e: 0}},
		previous: {a: 1, b: {c: 0}, d: {e: 0}},
	});
	applyOldSnapshot(object.current, object.previous);
	const snap = snapshot(object);
	expect(snap).toEqual({
		current: {a: 1, b: {c: 0}, d: {e: 0}},
		previous: {a: 1, b: {c: 0}, d: {e: 0}},
	});
	expect(snap.current.d).toBe(snap.previous.d);
	expect(() => {
		object.previous.a = 3;
	}).toThrow();

	object.current.a = 5;
	expect(snapshot(object)).toEqual({
		current: {a: 5, b: {c: 0}, d: {e: 0}},
		previous: {a: 1, b: {c: 0}, d: {e: 0}},
	});
});

it("supports restoring deleted properties", () => {
	const baseObject = {current: {a: 0}, previous: null};
	const object = proxy(baseObject);
	object.previous = snapshot(object.current);
	object.current.b = 10;
	expect(snapshot(object)).toEqual({
		current: {a: 0, b: 10},
		previous: {a: 0},
	});
	applyOldSnapshot(object.current, object.previous);
	expect(snapshot(object)).toEqual({
		current: {a: 0},
		previous: {a: 0},
	});
});

it("supports restoring added properties", () => {
	const baseObject = {current: {a: 0, c: 3}, previous: null};
	const object = proxy(baseObject);
	object.previous = snapshot(object.current);
	delete object.current.c;
	expect(snapshot(object)).toEqual({
		current: {a: 0},
		previous: {a: 0, c: 3},
	});
	applyOldSnapshot(object.current, object.previous);
	expect(snapshot(object)).toEqual({
		current: {a: 0, c: 3},
		previous: {a: 0, c: 3},
	});
});
