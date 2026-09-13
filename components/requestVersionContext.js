export function requestVersionContext(element) {
  return new Promise((resolve, reject) => {
    let supplied = false;
    element.dispatchEvent(
      new CustomEvent("flow:request-version-context", {
        bubbles: true,
        composed: true,
        detail: {
          resolve: (contextPromise) => {
            supplied = true;
            Promise.resolve(contextPromise).then(resolve, reject);
          },
        },
      }),
    );
    if (!supplied) {
      reject(new Error("No flow-version-context ancestor found."));
    }
  });
}
