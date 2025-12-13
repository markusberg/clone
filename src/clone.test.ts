import { Context, createContext, runInContext } from 'node:vm'
import { describe, it } from 'node:test'
import { strict as assert } from 'node:assert'

import clone, {
  __getRegExpFlags,
  __isArray,
  __isDate,
  __isRegExp,
} from './clone.js'

function inspect(obj: any): string {
  const seen = new Set<any>()
  return JSON.stringify(obj, (_key, val) => {
    if (val !== null && typeof val === 'object') {
      if (seen.has(val)) {
        return '[cyclic]'
      }

      seen.add(val)
    }

    return val
  })
}

// Creates a new VM in node, or an iframe in a browser in order to run the
// script
function apartContext(ctx: any, script: string, callback: Function) {
  const context: Context = createContext({ ctx })
  callback(runInContext(script, context))
}

describe('The clone function', () => {
  it('should clone strings', () => {
    let a = 'foo'
    assert.strictEqual(clone(a), a)
    a = ''
    assert.strictEqual(clone(a), a)
  })

  it('should clone number numbers', () => {
    let a = 0
    assert.strictEqual(clone(a), a)
    a = 1
    assert.strictEqual(clone(a), a)
    a = -1000
    assert.strictEqual(clone(a), a)
    a = 3.1415927
    assert.strictEqual(clone(a), a)
    a = -3.1415927
    assert.strictEqual(clone(a), a)
  })

  it('should clone date objects', () => {
    const a = new Date()
    const c = clone(a)
    assert.ok(!!a.getUTCDate && !!a.toUTCString)
    assert.ok(!!c.getUTCDate && !!c.toUTCString)
    assert.equal(a.getTime(), c.getTime())
  })

  it('should clone regular objects', () => {
    const a = { foo: { bar: 'baz' } }
    const b = clone(a)

    assert.deepEqual(b, a)
  })

  it('should clone Error objects', () => {
    const a = new Error('Boom!!!')
    const b = clone(a)

    assert.deepEqual(b, a)
    assert.notEqual(b, a)
    assert.ok(b instanceof Error)
    assert.equal(b.message, a.message)
  })

  it('should clone arrays', () => {
    let a = [{ foo: 'bar' }, 'baz']
    let b = clone(a)

    assert.ok(b instanceof Array)
    assert.deepEqual(b, a)
  })

  it('should clone buffers', () => {
    if (typeof Buffer == 'undefined') {
      return
    }

    let a = new Buffer('this is a test buffer')
    let b = clone(a)

    // no underscore equal since it has no concept of Buffers
    assert.deepEqual(b, a)
  })

  it('should clone regular expressions', () => {
    let a = /abc123/gi
    let b = clone(a)
    assert.deepEqual(b, a)

    let c: any = /a/g
    assert.ok(c.lastIndex === 0)

    c.exec('123a456a')
    assert.ok(c.lastIndex === 4)

    let d = clone(c)
    assert.ok(d.global)
    assert.ok(d.lastIndex === 4)
  })

  it('should clone objects containing arrays', () => {
    let a = {
      arr1: [{ a: '1234', b: '2345' }],
      arr2: [{ c: '345', d: '456' }],
    }

    let b = clone(a)

    assert.deepEqual(b, a)
  })

  it('should clone objects with circular references', () => {
    let c: any = [1, 'foo', { hello: 'bar' }, function () {}, false, [2]]
    let b = [c, 2, 3, 4]

    let a: any = { b: b, c: c }
    a.loop = a
    a.loop2 = a
    c.loop = c
    c.aloop = a

    let aCopy = clone(a)
    assert.ok(a != aCopy)
    assert.ok(a.c != aCopy.c)
    assert.ok(aCopy.c == aCopy.b[0])
    assert.ok(aCopy.c.loop.loop.aloop == aCopy)
    assert.ok(aCopy.c[0] == a.c[0])

    assert.ok(eq(a, aCopy))
    aCopy.c[0] = 2
    assert.ok(!eq(a, aCopy))
    aCopy.c = '2'
    assert.ok(!eq(a, aCopy))

    function eq(x: any, y: any): boolean {
      return inspect(x) === inspect(y)
    }
  })

  it('should clone object with no constructor', () => {
    let n = null

    let a: any = { foo: 'bar' }
    a.__proto__ = n
    assert.ok(typeof a === 'object')
    assert.ok(typeof a !== null)

    let b = clone(a)
    assert.ok(a.foo, b.foo)
  })

  it('should clone object with depth argument', () => {
    const a = {
      foo: {
        bar: {
          baz: 'qux',
        },
      },
    }

    const b = clone(a, false, 1)
    assert.deepEqual(b, a)
    assert.notEqual(b, a)
    assert.strictEqual(b.foo, a.foo)

    const c = clone(a, true, 2)
    assert.deepEqual(c, a)
    assert.notEqual(c.foo, a.foo)
    assert.strictEqual(c.foo.bar, a.foo.bar)
  })

  it('should maintain prototype chain in clones', () => {
    const T: any = function () {}
    const a = new T()
    const b = clone(a)
    assert.strictEqual(Object.getPrototypeOf(a), Object.getPrototypeOf(b))
  })

  it('should override the parent prototype with provided prototype', () => {
    const orig: any = function () {}

    const a = new orig()
    const b = clone(a, undefined, undefined, null)
    assert.strictEqual(b.__defineSetter__, undefined)
  })

  it('clone object with null children', () => {
    const a = {
      foo: {
        bar: null,
        baz: {
          qux: false,
        },
      },
    }

    const b = clone(a)

    assert.deepEqual(b, a)
  })

  it('should clone instance with getter', () => {
    const Ctor: any = function () {}
    Object.defineProperty(Ctor.prototype, 'prop', {
      configurable: true,
      enumerable: true,
      get: function () {
        return 'value'
      },
    })

    const a = new Ctor()
    const b = clone(a)

    assert.strictEqual(b.prop, 'value')
  })

  it('should clone objects with symbol properties', () => {
    const symbol = Symbol()
    const obj: any = {}
    obj[symbol] = 'foo'

    const child = clone(obj)

    assert.notEqual(child, obj)
    assert.equal(child[symbol], 'foo')
  })

  it('should treat symbols as primitives', () => {
    const symbol = Symbol()
    const obj = { foo: symbol }
    const child = clone(obj)

    assert.notEqual(child, obj)
    assert.equal(child.foo, obj.foo)
  })

  it('should clone RegExp flags', () => {
    assert.strictEqual(__getRegExpFlags(/a/), '')
    assert.strictEqual(__getRegExpFlags(/a/i), 'i')
    assert.strictEqual(__getRegExpFlags(/a/g), 'g')
    assert.strictEqual(__getRegExpFlags(/a/gi), 'gi')
    assert.strictEqual(__getRegExpFlags(/a/m), 'm')
  })

  describe('the apart context', () => {
    it('should clone within an apart context', () => {
      apartContext(
        { clone },
        'results = ctx.clone({ a: [1, 2, 3], d: new Date(), r: /^foo$/ig })',
        function (results: any) {
          assert.ok(results.a.constructor.toString() === Array.toString())
          assert.ok(results.d.constructor.toString() === Date.toString())
          assert.ok(results.r.constructor.toString() === RegExp.toString())
        },
      )
    })

    it('should recognize an Array object', () => {
      apartContext(null, 'results = [1, 2, 3]', (alien: unknown) => {
        const local = [4, 5, 6]
        assert.ok(__isArray(alien)) // recognize in other context.
        assert.ok(__isArray(local)) // recognize in local context.
        assert.ok(!__isDate(alien))
        assert.ok(!__isDate(local))
        assert.ok(!__isRegExp(alien))
        assert.ok(!__isRegExp(local))
      })
    })

    it('should recognize a Date object', () => {
      apartContext(null, 'results = new Date()', (alien: unknown) => {
        const local = new Date()

        assert.ok(__isDate(alien)) // recognize in other context.
        assert.ok(__isDate(local)) // recognize in local context.
        assert.ok(!__isArray(alien))
        assert.ok(!__isArray(local))
        assert.ok(!__isRegExp(alien))
        assert.ok(!__isRegExp(local))
      })
    })

    it('should recognize a RegExp object', () => {
      apartContext(null, 'results = /foo/', (alien: unknown) => {
        const local = /bar/

        assert.ok(__isRegExp(alien)) // recognize in other context.
        assert.ok(__isRegExp(local)) // recognize in local context.
        assert.ok(!__isArray(alien))
        assert.ok(!__isArray(local))
        assert.ok(!__isDate(alien))
        assert.ok(!__isDate(local))
      })
    })
  })

  it('should clone a Map', () => {
    const map: any = new Map()
    // simple key/value
    map.set('foo', 'bar')
    // circular object key/property
    map.set(map, map)
    // regular expando property
    map.bar = 'baz'
    // regular circular expando property
    map.circle = map

    const clonedMap = clone(map)
    assert.notEqual(map, clonedMap)
    assert.equal(clonedMap.get('foo'), 'bar')
    assert.equal(clonedMap.get(clonedMap), clonedMap)
    assert.equal(clonedMap.bar, 'baz')
    assert.equal(clonedMap.circle, clonedMap)
  })

  it('should clone a Set', () => {
    const set: any = new Set()
    // simple entry
    set.add('foo')
    // circular entry
    set.add(set)
    // regular expando property
    set.bar = 'baz'
    // regular circular expando property
    set.circle = set

    const clonedSet = clone(set)
    assert.notEqual(set, clonedSet)
    assert.ok(clonedSet.has('foo'))
    assert.ok(clonedSet.has(clonedSet))
    assert.ok(!clonedSet.has(set))
    assert.equal(clonedSet.bar, 'baz')
    assert.equal(clonedSet.circle, clonedSet)
  })

  describe('clone Promises', () => {
    it('should clone a Promise that resolves to a value', () => {
      clone(Promise.resolve('foo')).then((value: any) => {
        assert.equal(value, 'foo')
      })
    })

    it('should clone a Promise that rejects to a value', () => {
      clone(Promise.reject('bar')).catch((value: any) => {
        assert.equal(value, 'bar')
      })
    })

    it('should clone a Promise that resolves to a Promise', () => {
      clone(Promise.resolve(Promise.resolve('baz'))).then((value: any) => {
        assert.equal(value, 'baz')
      })
    })

    it('should clone a Promise that resolves to a circular value', () => {
      const circle: any = {}
      circle.circle = circle
      clone(Promise.resolve(circle)).then((value: any) => {
        assert.notEqual(circle, value)
        assert.equal(value.circle, value)
      })
    })

    it('should clone a Promise with additional props', () => {
      const expandoPromise: any = Promise.resolve('ok')
      expandoPromise.circle = expandoPromise
      expandoPromise.prop = 'val'

      const clonedPromise = clone(expandoPromise)
      assert.notEqual(expandoPromise, clonedPromise)
      assert.equal(clonedPromise.prop, 'val')
      assert.equal(clonedPromise.circle, clonedPromise)
      clonedPromise.then((value: any) => {
        assert.equal(value, 'ok')
      })
    })
  })

  it('should clone only enumerable symbol properties', () => {
    const source: any = {}
    const symbol1 = Symbol('the first symbol')
    const symbol2 = Symbol('the second symbol')
    const symbol3 = Symbol('the third symbol')
    source[symbol1] = 1
    source[symbol2] = 2
    source[symbol3] = 3
    Object.defineProperty(source, symbol2, {
      enumerable: false,
    })

    const cloned = clone(source)
    assert.equal(cloned[symbol1], 1)
    assert.equal(cloned.hasOwnProperty(symbol2), false)
    assert.equal(cloned[symbol3], 3)
  })

  it('should ignore non-enumerable properties by default', () => {
    const source: any = {
      x: 1,
      y: 2,
    }
    Object.defineProperty(source, 'y', {
      enumerable: false,
    })
    Object.defineProperty(source, 'z', {
      value: 3,
    })
    const symbol1 = Symbol('a')
    const symbol2 = Symbol('b')
    source[symbol1] = 4
    source[symbol2] = 5
    Object.defineProperty(source, symbol2, {
      enumerable: false,
    })

    const cloned = clone(source)
    assert.equal(cloned.x, 1)
    assert.equal(cloned.hasOwnProperty('y'), false)
    assert.equal(cloned.hasOwnProperty('z'), false)
    assert.equal(cloned[symbol1], 4)
    assert.equal(cloned.hasOwnProperty(symbol2), false)
  })

  it('should support cloning non-enumerable properties', () => {
    const source: any = { x: 1, b: [2] }
    Object.defineProperty(source, 'b', {
      enumerable: false,
    })
    const symbol = Symbol('a')
    source[symbol] = { x: 3 }
    Object.defineProperty(source, symbol, {
      enumerable: false,
    })

    const cloned = clone(source, false, Infinity, undefined, true)
    assert.equal(cloned.x, 1)
    assert.equal(cloned.b instanceof Array, true)
    assert.equal(cloned.b.length, 1)
    assert.equal(cloned.b[0], 2)
    assert.equal(cloned[symbol] instanceof Object, true)
    assert.equal(cloned[symbol].x, 3)
  })

  it('should allow enabling the cloning of non-enumerable properties via an options object', () => {
    const source = { x: 1 }
    Object.defineProperty(source, 'x', {
      enumerable: false,
    })

    const cloned: any = clone(source, {
      includeNonEnumerable: true,
    })
    assert.equal(cloned.x, 1)
  })

  it('should mark the cloned non-enumerable properties as non-enumerable', () => {
    const source: any = { x: 1, y: 2 }
    Object.defineProperty(source, 'y', {
      enumerable: false,
    })
    const symbol1 = Symbol('a')
    const symbol2 = Symbol('b')
    source[symbol1] = 3
    source[symbol2] = 4
    Object.defineProperty(source, symbol2, {
      enumerable: false,
    })

    const cloned = clone(source, {
      includeNonEnumerable: true,
    })
    assert.equal(Object.getOwnPropertyDescriptor(cloned, 'x')?.enumerable, true)
    assert.equal(
      Object.getOwnPropertyDescriptor(cloned, 'y')?.enumerable,
      false,
    )
    assert.equal(
      Object.getOwnPropertyDescriptor(cloned, symbol1)?.enumerable,
      true,
    )
    assert.equal(
      Object.getOwnPropertyDescriptor(cloned, symbol2)?.enumerable,
      false,
    )
  })

  it('clone should not fail when cloning an object that does not have setters defined on some of its properties', () => {
    //init an object with only a getter defined
    const x = null
    const source = { x }
    Object.defineProperty(source, 'x', {
      get: function () {
        return x
      },
    })

    assert.doesNotThrow(() => clone(source))
  })
})
