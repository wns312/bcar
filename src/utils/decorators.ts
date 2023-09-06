export function timer() {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originMethod = descriptor.value;
    const name = descriptor.value.constructor.name;
    if (name === 'AsyncFunction') {
      descriptor.value = async function (...args: any[]) {
        const startTime = Date.now()
        const result = await originMethod.apply(this, args);
        const endTime = Date.now()
        const executionTime = Math.ceil((endTime - startTime) / 1000)
        console.log(`Execution time : ${executionTime}(s)`);
        return result;
      }
    } else {
      descriptor.value = function (...args: any[]) {
        const startTime = Date.now()
        const result = originMethod.apply(this, args);
        const endTime = Date.now()
        const executionTime = Math.ceil((endTime - startTime) / 1000)
        console.log(`Execution time : ${executionTime}(s)`);
        return result;
      }
    }

  }
}
