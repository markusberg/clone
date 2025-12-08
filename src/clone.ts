type Config = {
  circular: boolean
  depth: number
  prototype: any
  includeNonEnumerable: boolean
}

/**
 * Clones (copies) an Object using deep copying.
 *
 * This function supports circular references by default, but if you are certain
 * there are no circular references in your object, you can save some CPU time
 * by calling clone(obj, false).
 *
 * Caution: if `circular` is false and `parent` contains circular references,
 * your program may enter an infinite loop and crash.
 *
 * @param `parent` - the object to be cloned
 * @param `circular` - set to true if the object to be cloned may contain
 *    circular references. (optional - true by default)
 * @param `depth` - set to a number if the object is only to be cloned to
 *    a particular depth. (optional - defaults to Infinity)
 * @param `prototype` - sets the prototype to be used when cloning an object.
 *    (optional - defaults to parent prototype).
 * @param `includeNonEnumerable` - set to true if the non-enumerable properties
 *    should be cloned as well. Non-enumerable properties on the prototype
 *    chain will be ignored. (optional - false by default)
 */
function clone<P>(
  parent: P,
  circular: boolean | Config = true,
  depth: number = Infinity,
  prototype: any,
  includeNonEnumerable: boolean = false,
) {
  if (typeof circular === 'object') {
    depth = circular.depth
    prototype = circular.prototype
    includeNonEnumerable = circular.includeNonEnumerable
    circular = circular.circular
  }
  // maintain two arrays for circular references, where corresponding parents
  // and children have the same index
  const ancestors: any = []
  const allChildren: any = []

  if (typeof circular == 'undefined') circular = true
  if (typeof depth == 'undefined') depth = Infinity

  // recurse this function so we don't reset allParents and allChildren
  function _clone<C>(parent: any, depth: number) {
    // cloning null always returns null
    if (parent === null) return null

    if (depth === 0) return parent

    let child
    let proto
    if (typeof parent !== 'object') {
      return parent
    }

    if (parent instanceof Map) {
      child = new Map()
    } else if (parent instanceof Set) {
      child = new Set()
    } else if (parent instanceof Promise) {
      child = new Promise((resolve, reject) => {
        parent.then(
          (value: any) => {
            resolve(_clone(value, depth - 1))
          },
          (err: any) => {
            reject(_clone(err, depth - 1))
          },
        )
      })
    } else if (clone.__isArray(parent)) {
      child = []
    } else if (clone.__isRegExp(parent)) {
      child = new RegExp(parent.source, __getRegExpFlags(parent))
      if (parent.lastIndex) child.lastIndex = parent.lastIndex
    } else if (clone.__isDate(parent)) {
      child = new Date(parent.getTime())
    } else if (Buffer.isBuffer(parent)) {
      child = Buffer.from(parent)
      return child
    } else if (parent instanceof Error) {
      child = Object.create(parent)
    } else {
      if (typeof prototype == 'undefined') {
        proto = Object.getPrototypeOf(parent)
        child = Object.create(proto)
      } else {
        child = Object.create(prototype)
        proto = prototype
      }
    }

    if (circular) {
      const index = ancestors.indexOf(parent)

      if (index !== -1) {
        return allChildren[index]
      }
      ancestors.push(parent)
      allChildren.push(child)
    }

    if (parent instanceof Map) {
      for (const [key, value] of parent.entries()) {
        const keyChild = _clone(key, depth - 1)
        const valueChild = _clone(value, depth - 1)
        child.set(keyChild, valueChild)
      }
    }
    if (parent instanceof Set) {
      for (const value of parent.values()) {
        const entryChild = _clone(value, depth - 1)
        child.add(entryChild)
      }
    }

    for (const i in parent) {
      const attrs = Object.getOwnPropertyDescriptor(parent, i)
      if (attrs) {
        child[i] = _clone(parent[i], depth - 1)
      }

      try {
        let objProperty: any = Object.getOwnPropertyDescriptor(parent, i)
        if (objProperty.set === 'undefined') {
          // no setter defined. Skip cloning this property
          continue
        }
        child[i] = _clone(parent[i], depth - 1)
      } catch (e) {
        if (e instanceof TypeError) {
          // when in strict mode, TypeError will be thrown if child[i] property only has a getter
          // we can't do anything about this, other than inform the user that this property cannot be set.
          continue
        } else if (e instanceof ReferenceError) {
          //this may happen in non strict mode
          continue
        }
      }
    }

    if (Object.getOwnPropertySymbols) {
      const symbols = Object.getOwnPropertySymbols(parent)
      for (const symbol of symbols) {
        // Don't need to worry about cloning a symbol because it is a primitive,
        // like a number or string.
        const descriptor: any = Object.getOwnPropertyDescriptor(parent, symbol)
        if (descriptor && !descriptor.enumerable && !includeNonEnumerable) {
          continue
        }
        child[symbol] = _clone(parent[symbol], depth - 1)
        Object.defineProperty(child, symbol, descriptor)
      }
    }

    if (includeNonEnumerable) {
      const allPropertyNames = Object.getOwnPropertyNames(parent)
      for (const propertyName of allPropertyNames) {
        const descriptor: any = Object.getOwnPropertyDescriptor(
          parent,
          propertyName,
        )
        if (descriptor && descriptor.enumerable) {
          continue
        }
        child[propertyName] = _clone(parent[propertyName], depth - 1)
        Object.defineProperty(child, propertyName, descriptor)
      }
    }

    return child
  }

  return _clone(parent, depth)
}

// private utility functions

function __objToStr(o: any) {
  return Object.prototype.toString.call(o)
}

function __isDate(o: any) {
  return typeof o === 'object' && __objToStr(o) === '[object Date]'
}
clone.__isDate = __isDate

function __isArray(o: any) {
  return typeof o === 'object' && __objToStr(o) === '[object Array]'
}
clone.__isArray = __isArray

function __isRegExp(o: any) {
  return typeof o === 'object' && __objToStr(o) === '[object RegExp]'
}
clone.__isRegExp = __isRegExp

function __getRegExpFlags(re: RegExp) {
  let flags = ''
  if (re.global) flags += 'g'
  if (re.ignoreCase) flags += 'i'
  if (re.multiline) flags += 'm'
  return flags
}
clone.__getRegExpFlags = __getRegExpFlags

module.exports = clone
