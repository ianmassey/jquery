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
						( pMethods[ i ] && promise[ pMethods[i] ] || pFactories[ i ]( cache ) ) :
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
	sliceDeferred = Array.prototype.slice;

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

	// Tell if the given argument is observable through a promise
	isObservable: function( object ) {
		return !!object && ( jQuery.type( object.promise ) === "function" );
	},

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
					deferred.resolveWith( this, arguments );
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
		var args = arguments,
			i = args.length,
			defer = i < 2 && jQuery.isObservable( object ) ? object : jQuery.Deferred();
		if ( i > 1 ) {
			var count = i + 1,
				resolveIndex = function( index, values ) {
					if ( index != null  ) {
						args[ index ] = values.length > 1 ? sliceDeferred.call( values, 0 ) : values[ 0 ];
					}
					if ( !( --count ) ) {
						defer.resolveWith( defer, args );
					}
				};
			jQuery.each( args, function( index, object ) {
				if ( jQuery.isObservable( object ) ) {
					object.promise().done(function() {
						resolveIndex( index, arguments );
					}).fail(function() {
						defer.rejectWith( defer, arguments );
					});
				} else {
					--count;
				}
			});
			resolveIndex();
		} else if ( defer !== object ) {
			defer.resolveWith( defer, i ? [ object ] : [] );
		}
		return defer.promise();
	}
});

})( jQuery );
