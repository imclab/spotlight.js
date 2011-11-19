/*!
 * Spotlight.js <http://github.com/bestiejs/spotlight.js/>
 * Copyright 2011 John-David Dalton <http://allyoucanleet.com/>
 * Based on Waldo <http://github.com/angus-c/waldo/>,
 * Copyright 2011 Angus Croll <http://javascriptweblog.wordpress.com/>
 * Both available under MIT license <http://mths.be/mit>
 */
;(function(window, undefined) {

  /* Used as the starting point(s) for the object crawler */
  var defaultRoots = [{ 'object': window, 'path': 'window' }],

  /** Detect free variable `exports` */
  freeExports = typeof exports == 'object' && exports,

  /** Detect free variable `global` */
  freeGlobal = typeof global == 'object' && global && (global == global.global ? (window = global) : global),

  /** Used in case an object doesn't have its own method */
  hasOwnProperty = {}.hasOwnProperty,

  /** Used to resolve a value's internal [[Class]] */
  toString = {}.toString,

  /** Filter functions used by `crawl()` */
  filters = {
    'custom': function(value, key, object) {
      // the `this` binding is set by `crawl()`
      return value.call(this, object[key], key, object);
    },
    'kind': function(value, key, object) {
      var kind = [value, value = object[key]][0];
      return isFunction(kind) ? value instanceof kind :
        typeof value == kind || getKindOf(value).toLowerCase() == kind.toLowerCase();
    },
    'name': function(value, key, object) {
      return value == key;
    },
    'value': function(value, key, object) {
      return object[key] === value;
    }
  },

  /**
   * Used to overwrite iterators so they don't interfere with for..in loops
   * https://developer.mozilla.org/en/new_in_javascript_1.7#Iterators
   */
  defaultIterator = (function() {
    try {
      var o = Iterator({ 'x': 1 }),
          fn = o.__iterator__;

      for (o in o) { }
      return toString.call(o) == '[object Array]' && isFunction(fn) && fn;
    } catch(e) { }
  }());

  /*--------------------------------------------------------------------------*/

  /**
   * Returns the first array value for which `callback` returns true.
   * @private
   * @param {Array} array The array to search.
   * @param {Function} callback A function executed per array value .
   * @returns {Mixed} The filtered value.
   */
  function filterOne(array, callback) {
    for (var index = 0, length = array.length; index < length; index++) {
      if (index in array && callback(array[index], index, array)) {
        return array[index];
      }
    }
  }

  /**
   * Iterates over an object's own properties, executing the `callback` for each.
   * @private
   * @param {Object} object The object to iterate over.
   * @param {Function} callback A function executed per own property.
   * @param {Mixed} [owner=null] The owner of the `object`.
   */
  function forOwn() {
    // list of possible shadowed properties of Object.prototype
    var shadowed = [
      'constructor', 'hasOwnProperty', 'isPrototypeOf',
      'propertyIsEnumerable', 'toLocaleString',
      'toString', 'valueOf'
    ];

    // flag for..in bugs
    var flag = (function() {
      function Klass() { this.valueOf = 0; };
      var count = Klass.prototype.valueOf = 0;
      for (var key in new Klass) { count++; }
      return count;
    }());

    // Safari 2 iterates over shadowed properties twice
    // http://replay.waybackmachine.org/20090428222941/http://tobielangel.com/2007/1/29/for-in-loop-broken-in-safari/
    var hasSeen = flag == 2 &&
      function(seen, key) {
        return hasKey(seen, key) || !(seen[key] = true);
      };

    // IE < 9 skips enumerable properties shadowing non-enumerable ones
    var forOwnShadowed = flag == 0 &&
      function(object, callback, owner) {
        // because IE < 9 can't set the [[Enumerable]] attribute of an existing
        // property and the `constructor` property of a prototype defaults to
        // non-enumerable, we manually skip the `constructor` property when
        // iterating over a `prototype` object.
        var skipCtor = isFunction(owner) && isObject(object);
        for (var key, i = 0; key = shadowed[i]; i++) {
          if (hasKey(object, key) &&
              !(skipCtor && key == shadowed[0]) &&
              callback(object[key], key, object) === false) {
            break;
          }
        }
      };

    // lazy define
    forOwn = function(object, callback, owner) {
      var done,
          seen = {},
          skipProto = isFunction(object);

      // some objects like Firefox 3's `XPCSafeJSObjectWrapper.prototype` may
      // throw errors when attempting to iterate over them
      object = Object(object);
      try {
        for (var key in object) {
          break;
        }
      } catch(e) {
        return;
      }

      for (var key in object) {
        // some properties like Firefox's `console.constructor` or IE's
        // `element.offsetParent` may throw errors when accessed
        try {
          toString.call(object[key]);
        } catch(e) {
          continue;
        }
        // Opera and Safari incorrectly set a function's `prototype` property
        // [[Enumerable]] value to true by default. Because of this we standardize
        // on skipping the the `prototype` property of functions regardless of
        // their [[Enumerable]] value.
        if (done =
            !(hasSeen && hasSeen(seen, key)) &&
            hasKey(object, key) &&
            !(skipProto && key == 'prototype') &&
            callback(object[key], key, object) === false) {
          break;
        }
      }
      if (!done && forOwnShadowed) {
        forOwnShadowed(object, callback, owner);
      }
    };
    forOwn.apply(null, arguments);
  }

  /**
   * Mimics ES 5.1's `Object.prototype.toString` behavior by returning the
   * value's [[Class]], "Null" or "Undefined" as well as other non-spec'ed results
   * like "Constructor" and "Global" .
   * @private
   * @param {Mixed} value The value to check.
   * @returns {String} Returns the value's [[Class]] or "Null" or "Undefined".
   */
  function getKindOf(value) {
    var result;
    if (value == null) {
      result = value === null ? 'Null' : 'Undefined';
    }
    else if (value == window) {
      result = 'Global';
    }
    else if (isFunction(value) && isHostType(value, 'prototype')) {
      // a function is assumed of kind "Constructor" if it has its own
      // enumerable prototype properties or doesn't have a [[Class]] of Object
      if (toString.call(value.prototype) == '[object Object]') {
        forOwn(value.prototype, function() { return !(result = 'Constructor'); }, value);
      } else {
        result = 'Constructor';
      }
    }
    return result || (toString.call(value).match(/^\[object (.*?)\]$/) || 0)[1] ||
      (result = typeof value, result.charAt(0).toUpperCase() + result.slice(1))
  }

  /**
   * Checks if an object has the specified key as a direct property.
   * @private
   * @param {Object} object The object to check.
   * @param {String} key The key to check for.
   * @returns {Boolean} Returns `true` if key is a direct property, else `false`.
   */
  function hasKey() {
    // lazy define for modern browsers
    if (isFunction(hasOwnProperty)) {
      hasKey = function(object, key) {
        return hasOwnProperty.call(Object(object), key);
      };
    }
    // or for Safari 2
    else if ({}.__proto__ == Object.prototype) {
      hasKey = function(object, key) {
        var result;
        object = Object(object);
        object.__proto__ = [object.__proto__, object.__proto__ = null, result = key in object][0];
        return result;
      };
    }
    // or for others (not as accurate)
    else {
      hasKey = function(object, key) {
        object = Object(object);
        var parent = (object.constructor || Object).prototype;
        return key in object && !(key in parent && object[key] === parent[key]);
      };
    }
    // or for an Opera < 10.53 bug, found by Garrett Smith, that occurs with
    // window objects and not the global `this`
    if (window.window == window && !hasKey(window.window, 'Object')) {
      var __hasKey = hasKey;
      hasKey = function(object, key) {
        return object == window
          ? key in object && object[key] !== {}[key]
          : __hasKey(object, key);
      };
    }
    return hasKey.apply(null, arguments);
  }

  /**
   * Checks if the specified `value` is a function.
   * @private
   * @param {Mixed} value The value to check.
   * @returns {Boolean} Returns `true` if `value` is a function, else `false`.
   */
  function isFunction(value) {
    return toString.call(value) == '[object Function]';
  }

  /**
   * Host objects can return type values that are different from their actual
   * data type. The objects we are concerned with usually return non-primitive
   * types of object, function, or unknown.
   * @private
   * @param {Mixed} object The owner of the property.
   * @param {String} property The property to check.
   * @returns {Boolean} Returns `true` if the property value is a non-primitive, else `false`.
   */
  function isHostType(object, property) {
    var type = object != null ? typeof object[property] : 'number';
    return !/^(?:boolean|number|string|undefined)$/.test(type) &&
      (type == 'object' ? !!object[property] : true);
  }

  /**
   * Checks if the specified `value` is an Object object.
   * @private
   * @param {Mixed} value The value to check.
   * @returns {Boolean} Returns `true` if `value` is an object, else `false`.
   */
  function isObject(value) {
    // some properties throw errors when accessed
    try {
      var constructor = value && value.constructor;
    } catch(e) { }
    // IE < 9 presents nodes like Object objects:
    // IE < 8 are missing the node's constructor property
    // IE 8 node constructors are typeof "object"
    return constructor && typeof constructor != 'object' &&
      getKindOf(value) == 'Object';
  }

  /*--------------------------------------------------------------------------*/

  /**
   * Performs argument type checks and calls `crawl()` with specified arguments.
   * @private
   * @param {String} name The name of the filter function passed.
   * @param {String} expected The data type expected of the given value.
   * @param {Mixed} value A generic argument passed to the callback.
   * @param {Object} [options={}] The options object passed.
   * @returns {Array|Null} If in debug mode return the value of the invoked function or `null` if errored.
   */
  function checkCall(name, expected, value, options) {
    var result = (!expected || RegExp('^(?:' + expected + ')$', 'i').test(getKindOf(value)))
      ? crawl(name, value, options)
      : (log('error', '`' + value + '` must be a ' + expected.split('|').join(' or ')), null);

    return spotlight.debug ? result : undefined;
  }

  /**
   * Crawls environment objects logging all properties that pass the callback filter.
   * @private
   * @param {Function|String} callback A function executed per object encountered.
   * @param {Mixed} callbackArg An argument passed to the callback.
   * @param {Object} [options={}] The options object.
   * @returns {Array} An array of arguments passed to each `console.log()` call.
   */
  function crawl(callback, callbackArg, options) {
    callback = filters[callback] || callback;
    options || (options = {});

    var data,
        iterator,
        owner,
        pool,
        pooled,
        queue,
        separator,
        roots = defaultRoots.slice(),
        object = options.object || roots[0].object,
        path = options.path,
        result = [];

    // resolve undefined path
    if (path == null) {
      path = (filterOne(roots, function(data) { return object == data.object; }) || { 'path': '<object>' }).path;
    }
    // resolve object roots
    if (options.object) {
      roots = [{ 'object': object, 'path': path }];
    }
    // crawl all root objects
    while ((data = roots.pop())) {
      object = data.object;
      path = data.path;
      queue = [{ 'object': object, 'path': path, 'pool': [object] }];
      owner = /(?:^|[\W_])prototype[\W_]*$/i.test(path) && callback;

      // a non-recursive solution to avoid call stack limits
      // http://www.jslab.dk/articles/non.recursive.preorder.traversal.part4
      while ((data = queue.pop())) {
        iterator = false;
        object = data.object;
        path = data.path;
        separator = path ? '.' : '';

        // avoid problems with iterators
        // https://github.com/ringo/ringojs/issues/157
        try {
          if (iterator = (iterator = object.__iterator__) && defaultIterator && isFunction(iterator)) {
            try {
              object.__iterator__ = defaultIterator;
            } catch(e) { }
            if (iterator != defaultIterator) {
              continue;
            }
          }
        } catch(e) {
          continue;
        }

        forOwn(object, function(value, key) {
          // inspect objects
          if (isObject(value)) {
            // clone current pool per prop on the current `object` to avoid siblings
            // polluting each others object pools
            pool = data.pool.slice();

            // check if already pooled (prevents circular references)
            // console.log('debug:', path, key, data.pool.length, data.pool.slice());
            pooled = filterOne(pool, function(data) { return value == data.object; });

            // add to "call" queue
            if (!pooled) {
              pool.push({ 'object': value, 'path': path + separator + key, 'pool': pool });
              queue.push(pool[pool.length - 1]);
            }
          }
          // if filter passed, log it
          // (IE may throw errors coercing properties like `window.external` or `window.navigator`)
          try {
            if (callback.call(data, callbackArg, key, object)) {
              result.push([
                path + separator + key + ' -> (' +
                (true && pooled ? '<' + pooled.path + '>' : getKindOf(value).toLowerCase()) + ')',
                value
              ]);
              log('text', result[result.length - 1][0], value);
            }
          } catch(e) { }
        },
        // attempt to handle an edge case where a function prototype is provided
        // via `options.object` by guesstimating, based on its `options.path` to
        // be a function prototype then supply a dummy function to trigger
        // `forOwn()`'s `skipCtor` flag.
        data.pool.length == 1 && owner);

        // restore iterator
        iterator && (object.__iterator__ = iterator);
      }
    }
    return result;
  }

  /**
   * Logs a message to the console.
   * @private
   * @param {String} type The log type, either "text" or "error".
   * @param {String} message The log message.
   * @param {Mixed} value An additional value to log.
   */
  function log() {
    var defaultCount = 2,
        console = typeof window.console == 'object' && window.console,
        document = typeof window.document == 'object' && window.document,
        JSON = typeof window.JSON == 'object' && isFunction(window.JSON && window.JSON.stringify) && window.JSON;

    // lazy define
    log = function(type, message, value) {
      var argCount = defaultCount,
          method = 'log';

      if (type == 'error') {
        argCount = 1;
        if (isHostType(console, type)) {
          method = type;
        } else {
          message = type + ': ' + message;
        }
      }
      // avoid logging if in debug mode and running from the CLI
      if (document || !spotlight.debug) {
        // because `console.log` is a host method we don't assume `.apply()` exists
        if (argCount < 2) {
          value = JSON ? JSON.stringify(value) : value;
          console[method](message + (type == 'error' ? '' : ' ' + value));
        } else {
          console[method](message, value);
        }
      }
    };

    // for Narwhal, Rhino or Ringo
    if (!console && !document && isFunction(window.print)) {
      console = { 'log': print };
    }
    // use noop for no log support
    if (!isHostType(console, 'log')) {
      log = function() { };
    }
    // avoid Safari 2 crash bug when passing more than 1 argument
    else if (console.log.length == 1) {
      defaultCount = 1;
    }
    return log.apply(null, arguments);
  }

  /*--------------------------------------------------------------------------*/

  /**
   * Crawls environment objects logging all object properties whose values
   * are of a specified constructor instance, [[Class]], or type.
   * @memberOf spotlight
   * @param {Function|String} kind The constructor, [[Class]], or type to check against.
   * @param {Object} [options={}] The options object.
   * @example
   *
   * // by constructor
   * spotlight.byKind(jQuery);
   *
   * // or by [[Class]]
   * spotlight.byKind('RegExp');
   *
   * // or by type
   * spotlight.byKind('undefined');
   *
   * // or special kind "constructor"
   * spotlight.byKind('constructor');
   */
  function byKind(kind, options) {
    return checkCall('kind', 'function|string', kind, options);
  }

  /**
   * Crawls environment objects logging all object properties of the specified name.
   * @memberOf spotlight
   * @param {String} name The property name to search for.
   * @param {Object} [options={}] The options object.
   * @example
   *
   * // basic
   * // > window.length -> (number) 0
   * spotlight.byName('length');
   *
   * // or with options
   * // (finds all "map" properties on jQuery)
   * // > $.map -> (function) function(a,b,c){...}
   * // > $.fn.map -> (function) function(a){...}
   * spotlight.byName('map', { 'object': jQuery, 'path': '$' });
   */
  function byName(name, options) {
    return checkCall('name', 'string', name, options);
  }

  /**
   * Crawls environment objects logging all object properties whose values are
   * a strict match for the specified value.
   * @memberOf spotlight
   * @param {Mixed} value The value to search for.
   * @param {Object} [options={}] The options object.
   * @example
   *
   * // basic
   * // > window.pageXOffset -> (number) 0
   * // > window.screenX -> (number) 0
   * // > window.length -> (number) 0
   * spotlight.byValue(0);
   */
  function byValue(value, options) {
    return checkCall('value', null, value, options);
  }

  /**
   * Crawls environment objects executing `callback`, passing the current
   * `value`, `key`, and `object` as arguments, against each object encountered
   * and logs properties for which `callback` returns true.
   * @memberOf spotlight
   * @param {Function} callback A function executed per object.
   * @param {Object} [options={}] The options object.
   * @example
   *
   * // filter by property names containing "oo"
   * spotlight.custom(function(value, key) { return key.indexOf('oo') > -1; });
   *
   * // or filter by falsey values
   * spotlight.custom(function(value) { return !value; });
   */
  function custom(callback, options) {
    return checkCall('custom', 'function', callback, options);
  }

  /*--------------------------------------------------------------------------*/

  /**
   * The primary namespace.
   * @type Object
   */
  var spotlight = {

    /**
     * A flag to indicate that methods will execute in debug mode.
     * @memberOf spotlight
     * @type Boolean
     */
    'debug': false,

    // searches for props by constructor instance, type, or [[Class]]
    'byKind': byKind,

    // searches for props by name
    'byName': byName,

    // searches for props by strict value matches
    'byValue': byValue,

    // executes a custom function per object
    'custom': custom
  };

  /*--------------------------------------------------------------------------*/

  // mod `defaultRoots` for server-side environments
  // for Narwhal, Node.js or Ringo
  if (freeGlobal && freeExports) {
    defaultRoots = [
      { 'object': freeExports, 'path': 'exports' },
      { 'object': freeGlobal, 'path': 'global' }
    ];
  }
  // for Rhino
  else if (typeof environment == 'object' && getKindOf(environment) == 'Environment') {
    defaultRoots[0].path = '<global object>';
  }

  /*--------------------------------------------------------------------------*/

  // expose spotlight
  // in Narwhal, Node.js or Ringo
  if (freeExports) {
    forOwn(spotlight, function(value, key) { freeExports[key] = value; });
    spotlight = freeExports;
  }
  // via curl.js or RequireJS
  else if (typeof define == 'function' && typeof define.amd == 'object' && define.amd) {
    define('spotlight', spotlight);
  }
  // in a browser or Rhino
  else {
    // use square bracket notation so Closure Compiler won't munge `spotlight`
    // http://code.google.com/closure/compiler/docs/api-tutorial3.html#export
    window['spotlight'] = spotlight;
  }
}(this));