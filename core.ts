export type Reactive<T = unknown> = T & { __reactive: true };
export type Snapshot<T = any> = T & { __snapshot: true };
export type Callback = () => void;

/** Global variables */

// Associates an object to its proxy
const proxyCache = new WeakMap<object, Reactive>();

// Associates a proxy to its parent proxy
const parentProxyCache = new WeakMap<object, Reactive | null>();

// Associates a proxy to its snapshot, or null if the snapshot was invalidated
const snapshotsCache = new WeakMap<Reactive, Snapshot>();

// Whether an object is a snapshot or not
const snapshotsSet = new WeakSet<Snapshot>();

// Associates each key of a proxy to the callbacks that depend on it
const callbacksCache = new WeakMap<
	Reactive,
	Record<PropertyKey, Set<Callback>>
>();

// Callbacks that have been invalidated and need to be re-run
const invalidatedCallbacks = new Set<Callback>();

// Associates a callback to the proxies and keys that depend on it
const callbackSubscriptionsCache = new WeakMap<
	Callback,
	Set<{ proxy: Reactive; key: PropertyKey }>
>();

// The callbacks for the current subscriptions
const currentCallbacks = new Set<() => unknown>();

/** Helper functions */

// Determine if an object can/should be wrapped in a proxy
const isMutable = (object: unknown): object is object =>
	!!object &&
	typeof object == "object" &&
	!snapshotsSet.has(object as Snapshot);

// Invalidate the snapshot of a proxy and all its parents
const invalidateSnapshots = (proxy: Reactive) => {
	if (!snapshotsCache.has(proxy)) {
		throw new Error("No saved snapshot found");
	}
	const snapshot = snapshotsCache.get(proxy);
	if (!snapshot) {
		// No need to invalidate the parents as they are already invalidated
		return;
	}
	snapshotsCache.set(proxy, null);

	const parentProxy = parentProxyCache.get(proxy);
	if (parentProxy) {
		invalidateSnapshots(parentProxy);
	}
};

// Wrap an object in a (lazy recursive) proxy that ensures snapshots get
// invalidated when a property is modified
export const makeReactive = <T extends object>(object: T): Reactive<T> => {
	return makeReactiveWithParent(object, null) as Reactive<T>;
};

const getCallbacksSetForKey = (proxy: Reactive, key: PropertyKey) => {
	const callbacksByKey = callbacksCache.get(proxy);
	if (!callbacksByKey) {
		throw new Error("No callbacks found for proxy");
	}
	let callbacksSet = callbacksByKey[key];
	if (!callbacksSet) {
		callbacksSet = new Set();
		callbacksByKey[key] = callbacksSet;
	}
	return callbacksSet;
};

const markCurrentCallbacks = (proxy: Reactive, key: PropertyKey) => {
	const callbacksSet = getCallbacksSetForKey(proxy, key);
	for (const callback of currentCallbacks) {
		callbacksSet.add(callback);
		let subscriptions = callbackSubscriptionsCache.get(callback);
		if (!subscriptions) {
			subscriptions = new Set();
			callbackSubscriptionsCache.set(callback, subscriptions);
		}
		subscriptions.add({ proxy, key });
	}
};

const invalidateCallbacks = (proxy: Reactive, key: PropertyKey) => {
	const callbacksSet = callbacksCache.get(proxy)![key];
	if (callbacksSet) {
		for (const callback of callbacksSet) {
			invalidatedCallbacks.add(callback);
		}
	}
};

const OWN_KEYS = Symbol("ownKeys");

const makeReactiveWithParent = (
	value: unknown,
	parentProxy: Reactive | null,
) => {
	if (!isMutable(value)) {
		return value;
	}
	if (proxyCache.has(value)) {
		return proxyCache.get(value) as Reactive;
	}

	const proxy = new Proxy(value, {
		get(target, key) {
			const value = Reflect.get(target, key);
			const descriptor = Object.getOwnPropertyDescriptor(target, key);
			if (!descriptor) {
				// Property that comes from the prototype chain. Do not wrap it.
				return value;
			}
			// TODO: is that needed?
			// if (descriptor && !descriptor.writable && !descriptor.configurable) {
			// 	// For frozen fields, we are required to return the same value
			// 	return value;
			// }

			markCurrentCallbacks(proxy, key);

			return makeReactiveWithParent(value, proxy);
		},

		set(target, key, newValue) {
			if (!(key in target)) {
				invalidateCallbacks(proxy, OWN_KEYS);
			}
			// No need to proxify the new value, it will be proxified when we
			// get it.
			const result = Reflect.set(target, key, newValue);
			invalidateSnapshots(proxy);
			invalidateCallbacks(proxy, key);
			return result;
		},

		deleteProperty(...args) {
			const result = Reflect.deleteProperty(...args);
			invalidateSnapshots(proxy);
			invalidateCallbacks(proxy, OWN_KEYS);
			return result;
		},
		ownKeys(target) {
			markCurrentCallbacks(proxy, OWN_KEYS);
			return Reflect.ownKeys(target);
		},
		has(target, key) {
			markCurrentCallbacks(proxy, key);
			return Reflect.has(target, key);
		},
		defineProperty() {
			throw new Error("Not implemented: defineProperty");
		},
		// getOwnPropertyDescriptor() {
		// 	throw new Error("Not implemented: getOwnPropertyDescriptor");
		// },
	}) as Reactive;
	proxyCache.set(value, proxy);
	parentProxyCache.set(proxy, parentProxy);
	snapshotsCache.set(proxy, null);
	callbacksCache.set(proxy, {});
	return proxy;
};

const FREEZE = true;

// Create a snapshot as lazily as possible, and cache it
export const takeSnapshot = (value: unknown): Snapshot => {
	// Immutable values
	if (!isMutable(value)) {
		return value;
	}

	if (!snapshotsCache.has(value as Reactive)) {
		throw new Error(
			"Trying to snapshot a non-proxified object " + JSON.stringify(value),
		);
	}

	// Already has a snapshot
	const existingSnapshot = snapshotsCache.get(value as Reactive);
	if (existingSnapshot) {
		return existingSnapshot;
	}

	// Create a new snapshot
	let snapshot: Snapshot;
	if (Array.isArray(value)) {
		snapshot = value.map((value) => takeSnapshot(value)) as Snapshot;
	} else {
		snapshot = {};
		for (const key of Object.keys(value)) {
			snapshot[key] = takeSnapshot(value[key]);
		}
	}
	if (FREEZE) {
		Object.freeze(snapshot);
	}
	snapshotsCache.set(value as Reactive, snapshot);
	snapshotsSet.add(snapshot);
	return snapshot;
};

// Given a proxy-wrapped object and an old snapshot of that object, revert to
// the old snapshot by reverting all the changes (so that only the affected
// parts will actually get modified).
export const applySnapshot = (proxy: Reactive, snapshot: Snapshot) => {
	// Bail out early if there is no change
	if (takeSnapshot(proxy) === snapshot) {
		return;
	}

	// Utility function to apply the old snapshot at a given key
	const applyOldSnapshotAtKey = (key: string) => {
		const value = proxy[key] as Reactive;
		if (isMutable(value)) {
			applySnapshot(value, snapshot[key]);
		} else if (proxy[key] !== snapshot[key]) {
			proxy[key] = snapshot[key];
		}
	};

	for (const key of Object.keys(proxy)) {
		applyOldSnapshotAtKey(key);
	}
	for (const key of Object.keys(snapshot)) {
		applyOldSnapshotAtKey(key);
	}
};

const rawSubscribe = <T>(
	proxy: Reactive,
	selector: (proxy: Reactive) => T,
	callback: () => void,
): T => {
	for (const { proxy, key } of callbackSubscriptionsCache.get(callback) || []) {
		const callbacksSet = callbacksCache.get(proxy)![key];
		if (callbacksSet) {
			callbacksSet.delete(callback);
		}
	}
	currentCallbacks.add(callback);
	const result = selector(proxy);
	currentCallbacks.delete(callback);
	return result;
};

export const subscribe = <T>(
	proxy: Reactive,
	selector: (proxy: Reactive) => T,
	callback: (t: T) => void,
) => {
	const newCallback = () =>
		callback(rawSubscribe(proxy, selector, newCallback));

	return newCallback();
};

const notifySubscribers = () => {
	for (const callback of invalidatedCallbacks) {
		callback();
	}
	invalidatedCallbacks.clear();
};

export const applyChange = (
	proxy: Reactive,
	change: (proxy: Reactive) => void,
) => {
	change(proxy);
	notifySubscribers();
};
