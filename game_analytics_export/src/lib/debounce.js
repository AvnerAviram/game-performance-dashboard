/**
 * Returns a debounced version of `fn` that delays invocation
 * until `ms` milliseconds have elapsed since the last call.
 */
export function debounce(fn, ms = 300) {
    let timer;
    return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), ms);
    };
}
