// All the created snapshots
const snapshots = new WeakSet();

// Determine if an object can/should be wrapped in a proxy
const isWrappable = (object) => (
	object && typeof object == "object" && !snapshots.has(object)
);

// Metadata associates to each object:
// - the current version number
// - the last snapshot
// - the version number of the last snapshot
const metadataCache = new WeakMap();
const getMetadata = (object) => {
	const metadata = metadataCache.get(object);
	if (metadata) {
		return metadata;
	}
	const newMeta = {
		version: 0,
		lastSnapshot: null,
		lastSnapshotVersion: -1,
	};
	metadataCache.set(object, newMeta);
	return newMeta;
};

// Keep track of the parent of each object, does not support circular references
const parentCache = new WeakMap();

// Called to increase the version number of the given object and all of its
// parents
const increaseVersion = (object) => {
	if (!object) {
		return;
	}
	const metadata = getMetadata(object);
	metadata.version++;
	increaseVersion(parentCache.get(object));
};

// Keep track of all the created proxies
const proxyCache = new WeakMap();

// Wrap an object in a (lazy recursive) proxy that ensures version numbers get
// increased when a property is modified
export const proxy = (object, parent = null) => {
	if (!isWrappable(object)) {
		return object;
	}
	const proxyObject = proxyCache.get(object);
	if (proxyObject) {
		return proxyObject;
	}

	const newProxy = new Proxy(object, {
		get(target, key) {
			const value = Reflect.get(target, key);
			const descriptor = Object.getOwnPropertyDescriptor(target, key);
			if (descriptor && !descriptor.writable && !descriptor.configurable) {
				return value
			}

			return proxy(value, newProxy);
		},

		set(...args) {
			const result = Reflect.set(...args);
			increaseVersion(newProxy);
			return result;
		},

		deleteProperty(...args) {
			const result = Reflect.deleteProperty(...args);
			increaseVersion(newProxy);
			return result;
		},
	});
	proxyCache.set(object, newProxy);
	parentCache.set(newProxy, parent);
	return newProxy;
};

// Create a snapshot as lazily as possible, and cache it
export const snapshot = (object) => {
	if (!isWrappable(object)) {
		return object;
	}
	const metadata = getMetadata(object);
	if (metadata.version == metadata.lastSnapshotVersion) {
		return metadata.lastSnapshot;
	}

	// The saved snapshot is out of date, create a new one
	let newSnapshot;
	if (Array.isArray(object)) {
		newSnapshot = object.map(value => snapshot(value));
	} else {
		newSnapshot = {};
		for (const key of Object.keys(object)) {
			newSnapshot[key] = snapshot(object[key]);
		}
	}
	Object.freeze(newSnapshot);
	snapshots.add(newSnapshot);

	// Save it and return it
	metadata.lastSnapshot = newSnapshot;
	metadata.lastSnapshotVersion = metadata.version;
	return newSnapshot;
};

// Given a proxy-wrapped object and an old snapshot of that object, revert to
// the old snapshot by reverting all the changes (so that only the affected
// parts will actually get modified).
export const applyOldSnapshot = (object, oldSnapshot) => {
	// Bail out early if there is no change
	if (snapshot(object) === oldSnapshot) {
		return;
	}

	// Utility function to apply the old snapshot at a given key
	const applyOldSnapshotAtKey = (key) => {
		if (isWrappable(object[key])) {
			applyOldSnapshot(object[key], oldSnapshot[key]);
		} else if (object[key] !== oldSnapshot[key]) {
			object[key] = oldSnapshot[key];
		}
	};

	for (const key of Object.keys(object)) {
		applyOldSnapshotAtKey(key);
	}
	for (const key of Object.keys(oldSnapshot)) {
		applyOldSnapshotAtKey(key);
	}
};
