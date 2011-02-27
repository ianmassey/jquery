(function( jQuery ) {

// promise and invert methods factory
function promiseInvertFactory( invert ) {
	return function( promise ) {
		var cache;
		return function( object ) {
			var i;
			if ( !cache ) {
				cache = {};
				for( i in pMethods ) {
					cache[ i ] = invert ?
						( pMethods[ i ] && promise[ pMethods[ i ] ] ||
							pFactories[ i ]( cache ) ) :
						promise[ i ];
				}
			}
			if ( !object ) {
				object = cache;
			} else {
				for( i in cache ) {
					object[ i ] = cache[ i ];
				}
			}
			return object;
		};
	};
}

// Promise methods factories
var pFactories = {
		always: function( promise ) {
			return function() {
				var args = sliceDeferred.call( arguments, 0 );
				promise.done( args ).fail( args );
				return this;
			};
		},
		chain: function( promise ) {
			return function( fn ) {
				var defer = jQuery.Deferred(),
					next;
				promise.done(function() {
					next = fn.apply( this, arguments );
					if ( jQuery.isFunction( next.promise ) ) {
						next.promise().then( defer.resolve, defer.reject );
					} else {
						defer.resolve( next );
					}
				}).fail( defer.reject );
				return defer.promise();
			};
		},
		invert: promiseInvertFactory( true ),
		promise: promiseInvertFactory(),
		then: function( promise ) {
			return function( doneCallbacks, failCallbacks ) {
				promise.done( doneCallbacks ).fail( failCallbacks );
				return this;
			};
		}
	},
	// Opposed methods
	oMethods = "always always done fail promise invert isResolved isRejected".split( " " ),
	// Promise methods
	pMethods = {},
	iDeferred,
	sliceDeferred = [].slice;

// Create promise methods list
for ( iDeferred = 0; iDeferred < oMethods.length; iDeferred += 2 ) {
	pMethods[ oMethods[iDeferred] ] = oMethods[ iDeferred + 1 ];
	pMethods[ oMethods[iDeferred+1] ] = oMethods[ iDeferred ];
}

oMethods = undefined;

// Add methods with no invert
for( iDeferred in pFactories ) {
	pMethods[ iDeferred ] = pMethods[ iDeferred ] || false;
}

// Constructors
jQuery.extend({

	// Create a simple deferred (single callbacks list)
	_Deferred: function() {
		var // callbacks list (false when cancelled)
			callbacks = [],
			// stored [ context , args ]
			fired = false,
			// to avoid firing when already doing so
			firing = false,
			// the deferred itself
			deferred  = {
				// Add callbacks
				done: function() {
					if ( callbacks ) {
						var i = 0,
							length = arguments.length,
							type,
							savedFired = fired;
						fired = false;
						for ( ; i < length; i++ ) {
							type = jQuery.type( arguments[ i ] );
							if ( type === "array" ) {
								deferred.done.apply( deferred, arguments[ i ] );
							} else if ( type === "function" ) {
								callbacks.push( arguments[ i ] );
							}
						}
						if ( savedFired ) {
							deferred.resolveWith( savedFired[ 0 ], savedFired[ 1 ] );
						}
					}
					return this;
				},
				// resolve with given context and args
				resolveWith: function( context, args ) {
					var callback;
					if ( callbacks && !fired && !firing ) {
						firing = true;
						try {
							while( ( callback = callbacks.shift() ) ) {
								callback.apply( context, args );
							}
						}
						finally {
							fired = [ context, args ];
							firing = false;
						}
					}
					return this;
				},
				// resolve with this as context (or promise if available) and given arguments
				resolve: function() {
					deferred.resolveWith(
						jQuery.isFunction( this.promise ) ? this.promise() : this,
						arguments );
					return this;
				},
				// Has this deferred been resolved?
				isResolved: function() {
					return firing || !!fired;
				},
				// Cancel
				cancel: function() {
					callbacks = false;
				}
			};

		return deferred;
	},

	// Full fledged deferred (two callbacks list)
	Deferred: function( fn ) {
		// Create the underlying deferreds
		var defer = jQuery._Deferred(),
			failDefer = jQuery._Deferred(),
			i;
		// Add missing methods to defer
		defer.reject = failDefer.resolve;
		defer.rejectWith = failDefer.resolveWith;
		for( i in pMethods ) {
			defer[ i ] = defer[ i ] ||
				pMethods[ i ] && failDefer[ pMethods[i] ] ||
				pFactories[ i ]( defer );
		}
		// Make sure only one callback list will be used
		defer.done( failDefer.cancel ).fail( defer.cancel );
		// Unexpose cancel
		delete defer.cancel;
		// Call given func if any
		if ( fn ) {
			fn.call( defer, defer );
		}
		return defer;
	},

	// Deferred helpers
	when: function( object ) {
		var i = arguments.length,
			deferred = i <= 1 && object && jQuery.isFunction( object.promise ) ?
				object :
				jQuery.Deferred(),
			promise = deferred.promise();

		if ( i > 1 ) {
			var array = sliceDeferred.call( arguments, 0 ),
				count = i,
				iFunction = function( i ) {
					array[ i ].promise().then( function( value ) {
						array[ i ] = arguments.length > 1 ?
								sliceDeferred.call( arguments, 0 ) : value;
						if ( !( --count ) ) {
							deferred.resolveWith( promise, array );
						}
					}, deferred.reject );
				};
			while( i-- ) {
				object = array[ i ];
				if ( object && jQuery.isFunction( object.promise ) ) {
					iFunction( i );
				} else {
					--count;
				}
			}
			if ( !count ) {
				deferred.resolveWith( promise, array );
			}
		} else if ( deferred !== object ) {
			deferred.resolve( object );
		}
		return promise;
	}
});

// Attach promises to elements
var eTaskCounter = jQuery.now(),
	eTasks = {};

jQuery.extend( jQuery.fn, {

	promise: function( object ) {
		var defer = jQuery.Deferred(),
			elements = this,
			i = elements.length,
			tasks,
			id,
			count = 1,
			checked = {};
		function resolve() {
			if ( !( --count ) ) {
				defer.resolveWith( elements, [ elements ] );
			}
		}
		function reject() {
			defer.rejectWith( elements, [ elements ] );
		}
		while ( i-- ) {
			tasks = jQuery.data( elements[ i ], "eTasks", undefined, true );
			if ( tasks ) {
				for ( id in tasks ) {
					if ( !checked[ id ] ) {
						checked[ id ] = true;
						count++;
						// We use then so that any Promise/A compliant
						// implementation can be used here
						eTasks[ id ].then( resolve, reject );
					}
				}
			}
		}
		resolve();
		return defer.promise( object );
	},

	// Mark with one or several promises
	// (or creates a defer and returns it if no argument is provided)
	attachPromise: function() {
		var elements = this,
			id = eTaskCounter++,
			create = !arguments.length,
			defer = eTasks[ id ] = create ?
				jQuery.Deferred() :
				jQuery.when.apply( jQuery, arguments ),
			i = elements.length,
			tasks = [];
		while( i-- ) {
			tasks[ i ] = jQuery.data( elements[ i ], "eTasks", undefined, true );
			if ( !tasks[ i ] ) {
				jQuery.data( elements[ i ], "eTasks", ( tasks[ i ] = {} ), true );
			}
			tasks[ i ][ id ] = true;
		}
		// We use then so that any Promise/A compliant
		// implementation can be used here
		// Hence the function declaration
		function done() {
			delete eTasks[ id ];
			i = elements.length;
			while( i-- ) {
				delete tasks[ i ][ id ];
				isEmpty = true;
				for ( var key in tasks[ i ] ) {
					isEmpty = false;
					break;
				}
				if ( isEmpty ) {
					jQuery.removeData( elements[ i ], "eTasks", true );
				}
			}
		}
		defer.then( done, done );
		return create ? defer : elements;
	}
} );

})( jQuery );
