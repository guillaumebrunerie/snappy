import { Reactive, subscribe, takeSnapshot } from "./core";

// wip

declare const proxy: Reactive;

export const useSelector = (selector, args) => {
	const tRef = useRef(null);
	return useSyncExternalStore(
		() =>
			subscribe(
				proxy,
				(proxy) => takeSnapshot(selector(proxy, args)),
				(t) => {
					tRef.current = t;
				},
			),
		() => tRef.current,
	);
};
