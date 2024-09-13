// Helper function to promisify callback-based functions
export function promisify(object, method, ...args) {
    return new Promise((resolve, reject) => {
        object[method](...args, (err, result) => {
            if (err) reject(err);
            else resolve(result);
        });
    });
}