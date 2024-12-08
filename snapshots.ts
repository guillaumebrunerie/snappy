type Wrapped<T = unknown> = T & { __wrapped: true };
type Snapshot<T = any> = T & { __snapshot: true };

// Determine if an object can/should be wrapped in a proxy
const isMutable = (object: unknown): object is object =>
	!!object &&
	typeof object == "object" &&
	!snapshotsSet.has(object as Snapshot);

// Keep track of the parent of each object, does not support circular references
const parentProxyCache = new WeakMap<object, Wrapped | null>();
const snapshotsCache = new WeakMap<Wrapped, Snapshot>();
const snapshotsSet = new WeakSet<Snapshot>();

const invalidateSnapshots = (proxy: Wrapped) => {
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

// Keep track of all the created proxies
const proxyCache = new WeakMap<object, Wrapped>();

// Wrap an object in a (lazy recursive) proxy that ensures snapshots get
// invalidated when a property is modified
export const proxify = (object: object): Wrapped => {
	return proxifyWithParent(object, null) as Wrapped;
};

const proxifyWithParent = (value: unknown, parentProxy: Wrapped | null) => {
	if (!isMutable(value)) {
		return value;
	}
	if (proxyCache.has(value)) {
		return proxyCache.get(value) as Wrapped;
	}

	const proxy = new Proxy(value, {
		get(target, key) {
			const value = Reflect.get(target, key);
			const descriptor = Object.getOwnPropertyDescriptor(target, key);
			if (descriptor && !descriptor.writable && !descriptor.configurable) {
				// For frozen fields, we are required to return the same value
				return value;
			}

			return proxifyWithParent(value, proxy);
		},

		set(...args) {
			// No need to proxify the new value, it will be proxified when we
			// get it, if needed
			const result = Reflect.set(...args);
			invalidateSnapshots(proxy);
			return result;
		},

		deleteProperty(...args) {
			const result = Reflect.deleteProperty(...args);
			invalidateSnapshots(proxy);
			return result;
		},
		// TODO: Implement other traps?
	}) as Wrapped;
	proxyCache.set(value, proxy);
	parentProxyCache.set(proxy, parentProxy);
	snapshotsCache.set(proxy, null);
	return proxy;
};

const FREEZE = true;

// Create a snapshot as lazily as possible, and cache it
export const takeSnapshot = (value: unknown) => {
	// Immutable values
	if (!isMutable(value)) {
		return value;
	}

	if (!snapshotsCache.has(value as Wrapped)) {
		throw new Error(
			"Trying to snapshot a non-proxified object " + JSON.stringify(value),
		);
	}

	// Already has a snapshot
	const existingSnapshot = snapshotsCache.get(value as Wrapped);
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
	snapshotsCache.set(value as Wrapped, snapshot);
	snapshotsSet.add(snapshot);
	return snapshot;
};

// Given a proxy-wrapped object and an old snapshot of that object, revert to
// the old snapshot by reverting all the changes (so that only the affected
// parts will actually get modified).
export const applyOldSnapshot = (proxy: Wrapped, snapshot: Snapshot) => {
	// Bail out early if there is no change
	if (takeSnapshot(proxy) === snapshot) {
		return;
	}

	// Utility function to apply the old snapshot at a given key
	const applyOldSnapshotAtKey = (key: string) => {
		const value = proxy[key] as Wrapped;
		if (isMutable(value)) {
			applyOldSnapshot(value, snapshot[key]);
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

// let currentCallbacks: (() => unknown)[] = [];

// export const subscribe = <T>(
// 	proxy: Wrapped,
// 	selector: (proxy: Wrapped) => T,
// 	callback: () => T,
// ): T => {
// 	currentCallbacks.push(callback);
// 	const result = selector(proxy);
// 	currentCallbacks.pop();
// 	return result;
// };
