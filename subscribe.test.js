import { expect, it, vi } from "vitest";
import { makeReactive, subscribe, applyChange, takeSnapshot } from "./core.ts";

it("supports subscriptions", () => {
	const fn = vi.fn();
	const obj = makeReactive({ a: 1, b: 2 });
	let n;
	subscribe(
		obj,
		(obj) => obj.a,
		(newN) => {
			fn();
			n = newN;
		},
	);
	expect(fn).toHaveBeenCalledTimes(1);
	expect(n).toBe(1);

	applyChange(obj, (obj) => {
		obj.a = 2;
	});
	expect(fn).toHaveBeenCalledTimes(2);
	expect(n).toBe(2);

	applyChange(obj, (obj) => {
		obj.b = 3;
	});
	expect(fn).toHaveBeenCalledTimes(2);
	expect(n).toBe(2);
});

it("supports dynamic dependencies", () => {
	const fn = vi.fn();
	const obj = makeReactive({ a: 1, b: 2, key: "a" });
	let n;
	subscribe(
		obj,
		(obj) => obj[obj.key],
		(newN) => {
			fn();
			n = newN;
		},
	);
	expect(n).toBe(1);
	expect(fn).toHaveBeenCalledTimes(1);

	applyChange(obj, (obj) => {
		obj.a = 42;
	});
	expect(n).toBe(42);
	expect(fn).toHaveBeenCalledTimes(2);

	applyChange(obj, (obj) => {
		obj.key = "b";
	});
	expect(n).toBe(2);
	expect(fn).toHaveBeenCalledTimes(3);

	applyChange(obj, (obj) => {
		obj.b = 43;
	});
	expect(n).toBe(43);
	expect(fn).toHaveBeenCalledTimes(4);

	applyChange(obj, (obj) => {
		obj.a = 1000;
	});
	expect(n).toBe(43);
	expect(fn).toHaveBeenCalledTimes(4);
});

it("correctly handles the last element of an array", () => {
	const fn = vi.fn();
	const obj = makeReactive([1, 2, 3]);
	let n;
	subscribe(
		obj,
		(obj) => obj.at(-1),
		(newN) => {
			fn();
			n = newN;
		},
	);
	expect(n).toBe(3);
	expect(fn).toHaveBeenCalledTimes(1);

	applyChange(obj, (obj) => {
		obj[2] = 42;
	});
	expect(n).toBe(42);
	expect(fn).toHaveBeenCalledTimes(2);

	applyChange(obj, (obj) => {
		obj.push(1000);
	});
	expect(n).toBe(1000);
	expect(fn).toHaveBeenCalledTimes(3);

	applyChange(obj, (obj) => {
		obj[2] = -1;
		obj[0] = -100;
	});
	expect(n).toBe(1000);
	expect(fn).toHaveBeenCalledTimes(3);
});

// Looks like we can subscribe to a callback that takes a snapshot. Is that
// correct?
it("allows snapshot subscriptions", () => {
	const fn = vi.fn();
	const obj = makeReactive({ a: 1, b: [2] });
	let x;
	subscribe(
		obj,
		(obj) => takeSnapshot(obj.b),
		(newX) => {
			fn();
			x = newX;
		},
	);
	const firstX = x;
	expect(x).toEqual([2]);
	expect(fn).toHaveBeenCalledTimes(1);

	applyChange(obj, (obj) => {
		obj.b.push(3);
	});
	expect(firstX).toEqual([2]);
	expect(x).toEqual([2, 3]);
	expect(fn).toHaveBeenCalledTimes(2);

	applyChange(obj, (obj) => {
		obj.b[0] = 1000;
	});
	expect(firstX).toEqual([2]);
	expect(x).toEqual([1000, 3]);
	expect(fn).toHaveBeenCalledTimes(3);
});

it("supports has", () => {
	const fn = vi.fn();
	const obj = makeReactive({ a: 1 });
	let x;
	subscribe(
		obj,
		(obj) => "b" in obj,
		(newX) => {
			fn();
			x = newX;
		},
	);
	expect(x).toEqual(false);
	expect(fn).toHaveBeenCalledTimes(1);

	applyChange(obj, (obj) => {
		obj.b = 2;
	});
	expect(x).toEqual(true);
	expect(fn).toHaveBeenCalledTimes(2);
});

it("supports Object.keys", () => {
	const fn = vi.fn();
	const obj = makeReactive({ a: 1 });
	let x;
	subscribe(
		obj,
		(obj) => Object.keys(obj),
		(newX) => {
			fn();
			x = newX;
		},
	);
	expect(x).toEqual(["a"]);
	expect(fn).toHaveBeenCalledTimes(1);

	applyChange(obj, (obj) => {
		obj.b = 2;
	});
	expect(x).toEqual(["a", "b"]);
	expect(fn).toHaveBeenCalledTimes(2);

	applyChange(obj, (obj) => {
		obj.a = 42;
	});
	expect(x).toEqual(["a", "b"]);
	expect(fn).toHaveBeenCalledTimes(2);

	applyChange(obj, (obj) => {
		delete obj.a;
	});
	expect(x).toEqual(["b"]);
	expect(fn).toHaveBeenCalledTimes(3);
});
