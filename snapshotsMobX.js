import { autorun, computed, observable, runInAction } from "mobx";

const snapshotComputedMap = new WeakMap();
const snapshotsSet = new WeakSet();

const makeSnapshotComputed = (obj) =>
	computed(
		() => {
			if (Array.isArray(obj)) {
				const snapshot = obj.map((item) => takeSnapshot(item));
				Object.freeze(snapshot);
				return observable(snapshot, observable.ref);
			} else if (typeof obj === "object" && obj !== null) {
				const snapshot = {};
				for (const key in obj) {
					snapshot[key] = takeSnapshot(obj[key]);
				}
				Object.freeze(snapshot);
				return observable(snapshot, observable.ref);
			} else {
				return obj;
			}
		},
		{ keepAlive: true },
	);

export const takeSnapshot = (obj) => {
	if (!isMutable(obj)) {
		return obj;
	}
	let snapshotComputed = snapshotComputedMap.get(obj);
	if (!snapshotComputedMap.has(obj)) {
		snapshotComputed = makeSnapshotComputed(obj);
		snapshotComputedMap.set(obj, snapshotComputed);
	}
	const snapshot = snapshotComputed.get();
	snapshotsSet.add(snapshot);
	return snapshot;
};

// Given a proxy-wrapped object and an old snapshot of that object, revert to
// the old snapshot by reverting all the changes (so that only the affected
// parts will actually get modified).
export const applySnapshot = (proxy, snapshot) => {
	// Bail out early if there is no change
	if (takeSnapshot(proxy) === snapshot) {
		return;
	}

	// Utility function to apply the old snapshot at a given key
	const applyOldSnapshotAtKey = (key) => {
		const value = proxy[key];
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

// Determine if an object can/should be wrapped in a proxy
const isMutable = (object) =>
	!!object && typeof object == "object" && !snapshotsSet.has(object);

export const makeReactive = observable;

export const applyChange = (obj, cb) => {
	runInAction(() => {
		cb(obj);
	});
};

export const subscribe = (obj, selector, callback) => {
	autorun(() => {
		callback(selector(obj));
	});
};
