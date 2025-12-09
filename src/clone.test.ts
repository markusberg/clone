import { Context, createContext, runInContext } from 'node:vm'
import { describe, it } from 'node:test'
import { strict as assert } from 'node:assert'

import clone, {
  __getRegExpFlags,
  __isArray,
  __isDate,
  __isRegExp,
} from './clone.js'

function inspect(obj: any) {
  const seen: any[] = []
  return JSON.stringify(obj, (key, val) => {
    if (val !== null && typeof val === 'object') {
      if (seen.indexOf(val) >= 0) {
        return '[cyclic]'
      }

      seen.push(val)
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

describe('clone tests', () => {
  it('clone string', () => {
    let a = 'foo'
    assert.strictEqual(clone(a), a)
    a = ''
    assert.strictEqual(clone(a), a)
  })

  it('clone number', () => {
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

  it('clone date', () => {
    const a = new Date()
    const c = clone(a)
    assert.ok(!!a.getUTCDate && !!a.toUTCString)
    assert.ok(!!c.getUTCDate && !!c.toUTCString)
    assert.equal(a.getTime(), c.getTime())
  })

  it('clone object', () => {
    const a = { foo: { bar: 'baz' } }
    const b = clone(a)

    assert.deepEqual(b, a)
  })

  it('clone error', () => {
    const a = new Error('Boom!!!')
    const b = clone(a)

    assert.deepEqual(b, a)
    assert.notEqual(b, a)
    assert.ok(b instanceof Error)
    assert.equal(b.message, a.message)
  })

  it('clone array', () => {
    let a = [{ foo: 'bar' }, 'baz']
    let b = clone(a)

    assert.ok(b instanceof Array)
    assert.deepEqual(b, a)
  })

  it('clone buffer', () => {
    if (typeof Buffer == 'undefined') {
      return
    }

    let a = new Buffer('this is a test buffer')
    let b = clone(a)

    // no underscore equal since it has no concept of Buffers
    assert.deepEqual(b, a)
  })

  it('clone regexp', () => {
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

  it('clone object containing array', () => {
    let a = {
      arr1: [{ a: '1234', b: '2345' }],
      arr2: [{ c: '345', d: '456' }],
    }

    let b = clone(a)

    assert.deepEqual(b, a)
  })

  it('clone object with circular reference', () => {
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

  it('clone within an apart context', () => {
    let results = apartContext(
      { clone: clone },
      'results = ctx.clone({ a: [1, 2, 3], d: new Date(), r: /^foo$/ig })',
      function (results: any) {
        assert.ok(results.a.constructor.toString() === Array.toString())
        assert.ok(results.d.constructor.toString() === Date.toString())
        assert.ok(results.r.constructor.toString() === RegExp.toString())
      },
    )
  })

  it('clone object with no constructor', () => {
    let n = null

    let a: any = { foo: 'bar' }
    a.__proto__ = n
    assert.ok(typeof a === 'object')
    assert.ok(typeof a !== null)

    let b = clone(a)
    assert.ok(a.foo, b.foo)
  })

  it('clone object with depth argument', () => {
    let a = {
      foo: {
        bar: {
          baz: 'qux',
        },
      },
    }

    let b = clone(a, false, 1)
    assert.deepEqual(b, a)
    assert.notEqual(b, a)
    assert.strictEqual(b.foo, a.foo)

    b = clone(a, true, 2)
    assert.deepEqual(b, a)
    assert.notEqual(b.foo, a.foo)
    assert.strictEqual(b.foo.bar, a.foo.bar)
  })

  it('maintain prototype chain in clones', () => {
    const T: any = function () {}
    const a = new T()
    const b = clone(a)
    assert.strictEqual(Object.getPrototypeOf(a), Object.getPrototypeOf(b))
  })

  it('parent prototype is overriden with prototype provided', () => {
    const T: any = function () {}

    const a = new T()
    const b = clone(a, true, Infinity, null)
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

    let b = clone(a)

    assert.deepEqual(b, a)
  })

  it('clone instance with getter', () => {
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

  it('clone object with symbol properties', () => {
    const symbol = Symbol()
    const obj: any = {}
    obj[symbol] = 'foo'

    let child = clone(obj)

    assert.notEqual(child, obj)
    assert.equal(child[symbol], 'foo')
  })

  it('symbols are treated as primitives', () => {
    const symbol = Symbol()
    const obj = { foo: symbol }
    const child = clone(obj)

    assert.notEqual(child, obj)
    assert.equal(child.foo, obj.foo)
  })

  it('get RegExp flags', () => {
    assert.strictEqual(__getRegExpFlags(/a/), '')
    assert.strictEqual(__getRegExpFlags(/a/i), 'i')
    assert.strictEqual(__getRegExpFlags(/a/g), 'g')
    assert.strictEqual(__getRegExpFlags(/a/gi), 'gi')
    assert.strictEqual(__getRegExpFlags(/a/m), 'm')
  })

  it('recognize Array object', () => {
    const results = apartContext(
      null,
      'results = [1, 2, 3]',
      (alien: unknown) => {
        const local = [4, 5, 6]
        assert.ok(__isArray(alien)) // recognize in other context.
        assert.ok(__isArray(local)) // recognize in local context.
        assert.ok(!__isDate(alien))
        assert.ok(!__isDate(local))
        assert.ok(!__isRegExp(alien))
        assert.ok(!__isRegExp(local))
      },
    )
  })

  it('recognize Date object', () => {
    const results = apartContext(
      null,
      'results = new Date()',
      (alien: unknown) => {
        const local = new Date()

        assert.ok(__isDate(alien)) // recognize in other context.
        assert.ok(__isDate(local)) // recognize in local context.
        assert.ok(!__isArray(alien))
        assert.ok(!__isArray(local))
        assert.ok(!__isRegExp(alien))
        assert.ok(!__isRegExp(local))
      },
    )
  })

  it('recognize RegExp object', () => {
    const results = apartContext(null, 'results = /foo/', (alien: unknown) => {
      const local = /bar/

      assert.ok(__isRegExp(alien)) // recognize in other context.
      assert.ok(__isRegExp(local)) // recognize in local context.
      assert.ok(!__isArray(alien))
      assert.ok(!__isArray(local))
      assert.ok(!__isDate(alien))
      assert.ok(!__isDate(local))
    })
  })

  it('clone a Map', () => {
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

  it('clone a Set', () => {
    const set: any = new Set()
    // simple entry
    set.add('foo')
    // circular entry
    set.add(set)
    // regular expando property
    set.bar = 'baz'
    // regular circular expando property
    set.circle = set

    let clonedSet = clone(set)
    assert.notEqual(set, clonedSet)
    assert.ok(clonedSet.has('foo'))
    assert.ok(clonedSet.has(clonedSet))
    assert.ok(!clonedSet.has(set))
    assert.equal(clonedSet.bar, 'baz')
    assert.equal(clonedSet.circle, clonedSet)
  })

  describe('clone Promises', () => {
    it('clone a Promise that resolves to a value', () => {
      clone(Promise.resolve('foo')).then((value: any) => {
        assert.equal(value, 'foo')
      })
    })

    it('clone a Promise that rejects to a value', () => {
      clone(Promise.reject('bar')).catch((value: any) => {
        assert.equal(value, 'bar')
      })
    })

    it('clone a Promise that resolves to a Promise', () => {
      clone(Promise.resolve(Promise.resolve('baz'))).then((value: any) => {
        assert.equal(value, 'baz')
      })
    })

    it('clone a Promise that resolves to a circular value', () => {
      const circle: any = {}
      circle.circle = circle
      clone(Promise.resolve(circle)).then((value: any) => {
        assert.notEqual(circle, value)
        assert.equal(value.circle, value)
      })
    })

    it('clone a Promise with additional props', () => {
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

  it('clone only enumerable symbol properties', () => {
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

    let cloned = clone(source)
    assert.equal(cloned[symbol1], 1)
    assert.equal(cloned.hasOwnProperty(symbol2), false)
    assert.equal(cloned[symbol3], 3)
  })

  it('clone should ignore non-enumerable properties by default', () => {
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

  it('clone should support cloning non-enumerable properties', () => {
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

  it('clone should allow enabling the cloning of non-enumerable properties via an options object', () => {
    const source = { x: 1 }
    Object.defineProperty(source, 'x', {
      enumerable: false,
    })

    const cloned: any = clone(source, {
      includeNonEnumerable: true,
    })
    assert.equal(cloned.x, 1)
  })

  it('clone should mark the cloned non-enumerable properties as non-enumerable', () => {
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

    let cloned = clone(source, {
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
