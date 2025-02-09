import { expect, it } from "vitest";
import {
	makeReactive,
	takeSnapshot,
	applySnapshot,
	applyChange,
} from "./snapshotsMobX.js";

it("snapshots a basic object", () => {
	const object = makeReactive({ a: 0 });
	const snap1 = takeSnapshot(object);
	applyChange(object, (object) => {
		object.a = 2;
	});
	const snap2 = takeSnapshot(object);
	expect(snap1).toEqual({ a: 0 });
	expect(snap2).toEqual({ a: 2 });
});

it("snapshots a complex object", () => {
	const object = makeReactive({ a: { b: 0 }, c: { d: 1 } });
	const snap1 = takeSnapshot(object);
	applyChange(object, (object) => {
		object.a.b = 2;
	});
	const snap2 = takeSnapshot(object);
	expect(snap1).toEqual({ a: { b: 0 }, c: { d: 1 } });
	expect(snap2).toEqual({ a: { b: 2 }, c: { d: 1 } });
});

it("supports adding complex objects", () => {
	const object = makeReactive({ a: 0 });
	const snap1 = takeSnapshot(object);
	applyChange(object, (object) => {
		object.b = { c: 1 };
	});
	const snap2 = takeSnapshot(object);
	expect(snap1).toEqual({ a: 0 });
	expect(snap2).toEqual({ a: 0, b: { c: 1 } });
	applyChange(object, (object) => {
		object.b.c = 2;
	});
	const snap3 = takeSnapshot(object);
	expect(snap2).toEqual({ a: 0, b: { c: 1 } });
	expect(snap3).toEqual({ a: 0, b: { c: 2 } });
});

it("returns the same snapshot for untouched parts", () => {
	const object = makeReactive({ a: { b: 0 }, c: { d: 1 } });
	const snap1 = takeSnapshot(object);
	applyChange(object, (object) => {
		object.a.b = 2;
	});
	const snap2 = takeSnapshot(object);
	expect(snap1.c).toBe(snap2.c);
});

it("supports arrays", () => {
	const object = makeReactive([1]);
	const snap1 = takeSnapshot(object);
	applyChange(object, (object) => {
		object.push(3);
	});
	const snap2 = takeSnapshot(object);
	expect(snap1).toEqual([1]);
	expect(snap2).toEqual([1, 3]);
});

it("supports deleting properties", () => {
	const object = makeReactive({ a: 0, b: 3 });
	const snap1 = takeSnapshot(object);
	applyChange(object, (object) => {
		delete object.a;
	});
	const snap2 = takeSnapshot(object);
	expect(snap1).toEqual({ a: 0, b: 3 });
	expect(snap2).toEqual({ b: 3 });
});

it("supports storing snapshots", () => {
	const baseObject = { current: { a: 0, b: { c: 0 } }, previous: [] };
	const object = makeReactive(baseObject);
	applyChange(object, (object) => {
		object.previous.push(takeSnapshot(object.current));
		object.current.a = 1;
		object.previous.push(takeSnapshot(object.current));
		object.current.a = 2;
	});
	expect(object.previous[0].b).toBe(object.previous[1].b);
	const snap = takeSnapshot(object);
	const expected = {
		current: { a: 2, b: { c: 0 } },
		previous: [
			{ a: 0, b: { c: 0 } },
			{ a: 1, b: { c: 0 } },
		],
	};
	expect(snap).toEqual(expected);
	expect(object.previous[0].b).toBe(object.previous[1].b);
	expect(snap.previous[0].b).toBe(snap.previous[1].b);
});

it("supports restoring snapshots", () => {
	const baseObject = {
		current: { a: 0, b: { c: 0 }, d: { e: 0 } },
		previous: null,
	};
	const object = makeReactive(baseObject);
	applyChange(object, (object) => {
		object.current.a = 1;
		object.previous = takeSnapshot(object.current);
		object.current.b.c = 2;
	});
	expect(takeSnapshot(object)).toEqual({
		current: { a: 1, b: { c: 2 }, d: { e: 0 } },
		previous: { a: 1, b: { c: 0 }, d: { e: 0 } },
	});
	applyChange(object, (object) => {
		applySnapshot(object.current, object.previous);
	});
	const snap = takeSnapshot(object);
	expect(snap).toEqual({
		current: { a: 1, b: { c: 0 }, d: { e: 0 } },
		previous: { a: 1, b: { c: 0 }, d: { e: 0 } },
	});
	expect(snap.current.d).toBe(snap.previous.d);
	// expect(() => {
	// 	object.previous.a = 3;
	// }).toThrow();

	applyChange(object, (object) => {
		object.current.a = 5;
	});
	expect(takeSnapshot(object)).toEqual({
		current: { a: 5, b: { c: 0 }, d: { e: 0 } },
		previous: { a: 1, b: { c: 0 }, d: { e: 0 } },
	});
});

it("supports restoring deleted properties", () => {
	const baseObject = { current: { a: 0 }, previous: null };
	const object = makeReactive(baseObject);
	applyChange(object, (object) => {
		object.previous = takeSnapshot(object.current);
		object.current.b = 10;
	});
	expect(takeSnapshot(object)).toEqual({
		current: { a: 0, b: 10 },
		previous: { a: 0 },
	});
	applyChange(object, (object) => {
		applySnapshot(object.current, object.previous);
	});
	expect(takeSnapshot(object)).toEqual({
		current: { a: 0 },
		previous: { a: 0 },
	});
});

it("supports restoring added properties", () => {
	const baseObject = { current: { a: 0, c: 3 }, previous: null };
	const object = makeReactive(baseObject);
	applyChange(object, (object) => {
		object.previous = takeSnapshot(object.current);
		delete object.current.c;
	});
	expect(takeSnapshot(object)).toEqual({
		current: { a: 0 },
		previous: { a: 0, c: 3 },
	});
	applyChange(object, (object) => {
		applySnapshot(object.current, object.previous);
	});
	expect(takeSnapshot(object)).toEqual({
		current: { a: 0, c: 3 },
		previous: { a: 0, c: 3 },
	});
});
