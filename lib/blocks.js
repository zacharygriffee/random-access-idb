export function blocks(size, start, end) {
    const result = [];
    for (let n = Math.floor(start / size) * size; n < end; n += size) {
        result.push({
            block: Math.floor(n / size),
            start: Math.max(n, start) % size,
            end: Math.min(n + size, end) % size || size
        })
    }
    return result
}