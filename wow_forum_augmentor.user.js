WFA// ==UserScript==
// @name		   WoW Forum Augmentor
// @namespace	  WFA
// @description	Enhances World of Warcraft NA/EU forums with WoW Progress scores
// @include		http://forums.worldofwarcraft.com/*
// @include		http://forums.wow-europe.com/*
// @include		http://us.battle.net/wow/en/forum/topic/*
// @include		http://eu.battle.net/wow/en/forum/topic/*
// ==/UserScript==

var WFA_VERSION = "_____17_____";

var GUILD_LINK_PARSER = /\?r=(.*?)&gn=(.*?)(&|$)/;


function emptyFunction(){}

function extend( child, parent )
{
	for( prop in parent.prototype )
	{
		if( !(prop in child ) && prop != 'prototype' )
		{
			child[prop] = parent[prop];	
		}
	}
	
	for( prop in parent.prototype )
	{
		if( !(prop in child.prototype ) )
		{
			child.prototype[prop] = parent.prototype[prop];	
		}
	}
}

function classify( obj )
{
	
	var returnObj = function()
	{
		obj.prototype.init.apply( this, arguments )
	}
	
	if( !obj.prototype )
	{
		obj.prototype = {}	
	}
	
	if( !obj.prototype.init )
	{
		obj.prototype.init = emptyFunction;	
	}
	
	for( var i = 0; i < arguments.length; i++ )
	{
		extend( returnObj, arguments[i] );	
	}
	return returnObj;
}

function hasClass( node )
{
	var retVal = false;
	if( node && node.className )
	{
		if( !node._classHash || !node._parsedClass == node.className )
		{
			node._classHash = {};
			names = String(node.className).split( ' ' );
			for( var i = 0; i < names.length; i++ )
			{
				node._classHash[names[i]] = 1;
			}
		}
		
		var retVal = true;
		for( var i = 1; i < arguments.length && retVal; i++ )
		{
			if( !node._classHash[arguments[i]] )
			{
				retVal = false;
			}
		}
	}
	return retVal;
}

var nameSpaceResolver = function(prefix) 
{
    return prefix === 'x' ? 'http://www.w3.org/1999/xhtml' : null;
}

//Name space for all WoW Forum related operations
//including obtaining rank information and styling posts.
var WFA =
{
	worldThreshold: 100, //not used yet
	localThreshold: 100, //not used yet
	realmThreshold: 3, //not used yet
	ignoredPostOpacity: 0.45, //ok to change, the % oppacity to apply to ignored posts. Values are 0->1 (0 = 0% invisible, 1 = 100% no change, 50% = half transparent.
	applyIgnoredPostOpacity: true, //ok to change, whether posts w/o rank, low rank, or no progression should be grayed out (default=true)
	applyColorPostBorder: true, //ok to change, whether the border around each post should also be colored (default=true)
	maxEntryAge: 86400000, //ok to change, value in miliseconds. Maximum length of time any one record should be kept (86400000ms = 86400s = 24hrs)
	MAX_LEGENDARY: 3, //maximum world/region rank for legendary status, ok to change, should be higher than 0 and lower than epic
	MAX_EPIC: 25, //maximum world/region rank for epic status, ok to change should be higher than legendary & lower than rare
	MAX_RARE: 500, //maximum world/region rank for rare status, ok to change should be higher than epic
	COLOR_LEGENDARY:"#FF8000", //legendary HTML hex color (orange), ok to change
	COLOR_EPIC: "#A335EE", //epic HTML hex color (purple), ok to change
	COLOR_RARE: "#0070DD", //rare HTML hex color (blue), ok to change
	COLOR_COMMON: "#1EFF00", //rare HTML hex color (green), ok to change
	COLOR_BLUE: "#00C0FF", //blue post border color, ok to change
	IS_REQUESTING: 1, //do not change: constant used to denote a requesting status
	FAILED_REQUEST: 2,//do not change: constant used to denote a failed request
	RANK_PROPERTY: "wfa_rankCache",
	rankCache:{}, //do not change
	MAX_CACHE_ENTRIES: 15000,

	/**************************************************************
	 * Returns the two digit forum area/locale of the current 
	 * WoW forum being browsed.
	 *
	 * Example: 'US' 'EU'
	 *
	 * @returns A two digit string representing the forum locale
	 *
	 **************************************************************/
	getForumInfo: function()
	{
		var area = {region:'',isBnet:''};
		var url = document.location;
		if( String(url).match( /forums\.wow-europe\.com/ ) )
		{
			area = {region:'EU',isBnet:false};	
		}
		else if( String(url).match( /forums\.worldofwarcraft\.com/ ) )
		{
			area = {region:'US',isBnet:false};
		}
		else if( String(url).match( /us\.battle\.net\/wow\/en\// ) )
		{
			area = {region:'US',isBnet:true};	
		}
		else if( String(url).match( /eu\.battle\.net\/wow\/en\// ) )
		{
			area = {region:'EU',isBnet:true};	
		}
		return area;
	},
	/********************************************************
	 *
	 *
	 *
	 *******************************************************/
	getPosts: function()
	{
		var posts = [];
		//make sure this is a supported forum are else we can't be 
		//sure that CSS class names/DOM hierarchy is compatible.
		var forumInfo = WFA.getForumInfo();
		
		if( forumInfo.region )
		{
			if( forumInfo.isBnet )
			{
				posts = document.getElementsByClassName( 'post' );
			}
			else
			{
				posts = document.getElementsByClassName( 'postdisplay' );
			}
		}
		return posts;
	},
	/**************************************************************
	 * Before the current page unloads, save the current
	 * guild rank cache to be used on subsequent pages.
	 *
	 **************************************************************/
	saveCache: function()
	{
		var json = JSON.stringify( WFA.rankCache );
		localStorage.setItem( WFA.RANK_PROPERTY, json );
	},
	keys: function(o){ var a = []; for (var k in o) a.push(k); return a; },
	/**************************************************************
	 * Restores the previously saved cache or initializes it to 
	 * an empty hash.
	 *
	 **************************************************************/	
	restoreCache: function()
	{
		var json = localStorage.getItem( WFA.RANK_PROPERTY );
		if( json )
		{
			json = JSON.parse( json );
			if( typeof( json ) != 'object' || json === null )
			{
				json = {};
			}
		}
	 
		var cacheSize = WFA.keys(json).length;
		//console.log( 'cs: ' + cacheSize );
		if( cacheSize >= WFA.MAX_CACHE_ENTRIES )
		{
			var now = (new Date()).getTime();
			var oldest = now - WFA.maxEntryAge;
			 
			for( record in json )
			{
				delete( json[record] );
			}
			//if still over limit, give up and wipe it.
			cacheSize = WFA.keys(json).length;
			if( cacheSize >= WFA.MAX_CACHE_ENTRIES )
			{
				json = {};
			}
		}
		WFA.rankCache = json;
	},
	/**************************************************************
	 * Creates a unique key string for guild from a specific
	 * locale and realm.
	 *
	 * @param (String) area Two digit area locale
	 * @param (String) realm A WoW realm server name
	 * @param (String) guild A WoW guild located in the specified 
	 *				 area & realm
	 *
	 **************************************************************/
	generateGuildRealmKey: function( area, realm, guild )
	{
		return String(area + "_" + realm + "_" + guild).toLowerCase();
	},
	/**************************************************************
	 * Attempts to retrieve a guilds rank information.
	 *
	 * @param (String) area Two digit area locale
	 * @param (String) realm A WoW realm server name
	 * @param (String) guildName A WoW guild located in the 
	 *				 specified area & realm
	 * @param (Function) callBack a handler that accepts the guild rank info as a single argument
	 *
	 * @returns WFA.IS_REQUEST, WFA.FAILED_REQUEST, or a rank
	 *			info object: {score:,world_rank,area_rank:}
	 * 
	 *
	 **************************************************************/
	getGuildRankInfo: function( area, realm, guildName, callBack )
	{
		if( area && guildName && realm )
		{
			var key = WFA.generateGuildRealmKey( area, realm, guildName );
			//not cached or cache is old
			if( !WFA.rankCache[key] || ((new Date()) - WFA.rankCache[key].timestamp) > WFA.maxEntryAge )
			{
				WFA.requestRank( area, realm, guildName, callBack );
			}
			else
			{
				callBack( WFA.rankCache[key].value );
			}
		}
		else
		{
			return null;	
		}
	},
	isChrome: function()
	{
	    return navigator.userAgent.toLowerCase().indexOf('chrome') > -1;
	},
	/**************************************************************
	 * Requests a guild ranks information from WowProgress.com.
	 *
	 * 
	 * @param (String) area Two digit area locale
	 * @param (String) realm A WoW realm server name
	 * @param (String) guild A WoW guild located in the 
	 *				 specified area & realm
	 * @param (Function) callBack Call back handler that takes a single guildInfo parameter
	 * 
	 *
	 * @returns WFA.IS_REQUEST, WFA.FAILED_REQUEST, or a rank
	 *			info object: {score:,world_rank,area_rank:}
	 *
	 **************************************************************/
	requestRank: function( area, realm, guild, callBack )
	{
		
		var key = WFA.generateGuildRealmKey( area, realm, guild );
		area = area.replace( /'/g, '-' ).replace( /\s/g, "+").toLowerCase();
		realm = realm.replace( /'/g, '-' ).replace( /\s/g, "-").toLowerCase();
		guild = guild.replace( /'/g, '-' ).replace( /\s/g, "+");
		var requestUrl = 'http://www.wowprogress.com/guild/'+area+'/'+escape(realm)+'/'+escape(guild)+'/json_rank';
		
        if( WFA.isChrome() )
        {
        	chrome.extension.sendRequest({'action' : 'fetchGuildRank', 'requestUrl':requestUrl}, function(responseDetails){WFA.onRequest( responseDetails, key,area, realm, guild, callBack)});
        }
        else
        {
    		GM_xmlhttpRequest(
    		{
    			method: 'GET',
    			url: requestUrl,
    			headers: 
    			{
    				'Accept': 'text/html,text/javascript,text/json',
    			},
    			onload: function(responseDetails){WFA.onRequest( responseDetails, key,area, realm, guild, callBack)}
		    });	
        }
		
	},
	/**************************************************************
	 * Callback handler for guild rank information requests
	 * or Chrome background responses with a fake response object.
	 *
	 *
	 * @param (Object) responseDetails The fake response object or a real xmlHttpRequest response object
	 * @param (String) key Unique cache key any responses should be saved to
	 * @param (String) area The US/EU locale string
	 * @param (String) realm A realm name of the requested guild
	 * @param (String) guild A guild name 
	 * @param (Function) A handler that accepts the guild rank info as single argument
	 *
	 **************************************************************/
	onRequest: function(responseDetails, key, area, realm, guild, callBack)
	{		
		var responseObj = WFA.FAILED_REQUEST;
		
		if( responseDetails.responseText )
		{
			responseObj = JSON.parse( responseDetails.responseText );
		}
		
		if( !responseObj )
		{
			responseObj = WFA.FAILED_REQUEST;	
		}
		WFA.rankCache[key] = {value: responseObj, timestamp:(new Date()).getTime() };
		callBack( responseObj );
		
	},
	/**************************************************************
	 * Returns the color that a world/area ranks should be colored
	 * as.
	 *
	 * @param (Number) rank The rank the color
	 * @returns (String) A HTML hex string color
	 *
	 **************************************************************/
	getRankColor: function( rank )
	{
		if( rank <= WFA.MAX_LEGENDARY )
		{
			return WFA.COLOR_LEGENDARY;
		}
		else if( rank <= WFA.MAX_EPIC )
		{
			return WFA.COLOR_EPIC;
		}
		else if( rank <= WFA.MAX_RARE )
			return WFA.COLOR_RARE;
		else
		{
			return WFA.COLOR_COMMON;
		}
		
	},
	/**************************************************************
	 * Set the option of whether to apply border colors or not.
	 *
	 * @param (Boolean) shouldColor To add colored borders or not
	 *
	 **************************************************************/
	enableBorderColor: function( enabled )
	{
		if( enabled )
		{
			WFA.applyColorPostBorder = 1;
			WFA.setSavedValue( 'applyColorPostBorder', 1 ) 
		}
		else
		{
			WFA.applyColorPostBorder = 0;
			WFA.setSavedValue( 'applyColorPostBorder', 0 ) 
		}   
	},
	/**************************************************************
	 * Set the option of whether to gray posts out
	 *
	 * @param (Boolean) shouldIgnore To gray posts or not
	 *
	 **************************************************************/
	enableIgnorePosts: function( shouldIgnore )
	{
		if( shouldIgnore )
		{
			WFA.applyIgnoredPostOpacity = 1;
			WFA.setSavedValue( 'applyIgnoredPostOpacity', 1 )
		}
		else
		{
			WFA.applyIgnoredPostOpacity = 0;
			WFA.setSavedValue( 'applyIgnoredPostOpacity', 0 )
		}   
	},
	/**************************************************************
	 * Return whether post borders are being grayed out to ignore
	 * or not.
	 *
	 * @returns (Number) 1 grayed 0 not
	 *
	 **************************************************************/
	getIgnorePosts:function()
	{
		return WFA.applyIgnoredPostOpacity;
	},
	/**************************************************************
	 * Return whether post borders are being colored or not.
	 *
	 * @returns (Number) 1 colored 0 not colored
	 *
	 **************************************************************/
	getApplyBorderColor:function()
	{
		return WFA.applyColorPostBorder;   
	},
	/**************************************************************
	 * Loads all options from FireFox's saved variable cache
	 *
	 *
	 **************************************************************/
	loadOptions: function()
	{

    	WFA.enableBorderColor( parseInt(WFA.getSavedValue( 'applyColorPostBorder' ) || '0' ) );
    	WFA.enableIgnorePosts( parseInt( WFA.getSavedValue( 'applyIgnoredPostOpacity' ) || '1' ) );   

	},
	/**************************************************************
	 * Handles restoring values from persistent storage. Done to 
	 * decouple logic of localStrage vs anything else that might
	 * be needed in various future supported browsers.
	 *
	 * @param (String) property A property name to retrieve
	 * @returns (String) The string property stored.
	 *
	 **************************************************************/
	getSavedValue: function( property )
	{
		return localStorage.getItem( property );	
	},
	/**************************************************************
	 * Handles setting values in persistent storage. Done to 
	 * decouple logic of localStrage vs anything else that might
	 * be needed in various future supported browsers.
	 *
	 * @param (String) property A property name to retrieve
	 * @param (String) value A string value to store
	 *
	 **************************************************************/
	setSavedValue: function( property, value )
	{
		return localStorage.setItem( property, value );
	}
}


//Namespace for operations dealing with the GUI options panel
var WFA_OPTIONS = 
{
	//do not change anything here
	handle: null, //created on initialize WFA Options tab
	optionsPane: null, //created during build(), main options pane
	reloadButton: null, //created during build(), reload page button
	isOpen: false, //current state of the options pane
	COLOR_BORDER_ID: "colorBorders", //ids used for check box elements
	IGNORE_POSTS_ID: "ignorePosts",
	/**************************************************************
	 * Creates and displays the WFA Options tab.
	 *
	 **************************************************************/
	initialize: function()
	{
		var handle = document.createElement("DIV");
		handle.style.position = "fixed";
		handle.style.width = "100px";
		handle.style.lineHeight = "10px";
		handle.style.fontSize = "10px";
		handle.style.fontFamily = "sans-serif";
		handle.style.color = "white";
		handle.style.height = "12px";
		handle.style.backgroundColor = "black";
		handle.style.border = "1px solid grey";
		handle.style.bottom = "0px";
		handle.style.right = "0px";
		handle.style.textAlign = "center";
		handle.style.zIndex = 1;
		handle.innerHTML = "WFA Options";
		handle.addEventListener('mouseover',WFA_OPTIONS.onmouseover, true );

		WFA_OPTIONS.handle = handle;
		document.body.appendChild( handle );  
	},
	/**************************************************************
	 * Shows the main option pane; builds if necessary.
	 *
	 **************************************************************/
	show: function()
	{
	   if( !WFA_OPTIONS.optionsPane )
	   {
			WFA_OPTIONS.build();
	   }
	   WFA_OPTIONS.optionsPane.style.display = "block";
	   WFA_OPTIONS.isOpen = true;
	   
	},
	/**************************************************************
	 * Hides the main option pane.
	 *
	 **************************************************************/
	hide: function()
	{
	  WFA_OPTIONS.optionsPane.style.display = "none";  
	  WFA_OPTIONS.isOpen = false;
	},
	/**************************************************************
	 * Builds the main options pane and all components.
	 *
	 **************************************************************/
	build: function()
	{
		var optionsPane = document.createElement("div");
		optionsPane.style.display = "none";
		optionsPane.style.position = "fixed";
		optionsPane.style.width = "145px";
		optionsPane.style.lineHeight = "10px";
		optionsPane.style.fontSize = "10px";
		optionsPane.style.fontFamily = "sans-serif";
		optionsPane.style.color = "white";
		optionsPane.style.height = "115px";
		optionsPane.style.backgroundColor = "black";
		optionsPane.style.border = "1px solid grey";
		optionsPane.style.bottom = "0px";
		optionsPane.style.right = "0px";
		optionsPane.style.textAlign = "center";
		optionsPane.style.zIndex = 2;
		optionsPane.innerHTML = "WFA Options";
		
		var optionsSubPane = document.createElement("table");
		var row = document.createElement( "tr" );
		var cell = document.createElement( "td" );
		var checkBox = document.createElement( "input" );
		checkBox.type = "checkbox";
		checkBox.id = WFA_OPTIONS.COLOR_BORDER_ID;
		
		var applyColorPostBorder = WFA.getApplyBorderColor();
		
		if( typeof( applyColorPostBorder ) == "undefined" )
		{
			applyColorPostBorder = 1;
		}
		checkBox.checked = applyColorPostBorder;
		checkBox.addEventListener('click',WFA_OPTIONS.onclick, true );
		cell.appendChild( checkBox );
		row.appendChild( cell );
		
		cell = document.createElement( "td" );
		cell.innerHTML = "Color post borders";
		row.appendChild( cell );
		optionsSubPane.appendChild( row );
		
		row = document.createElement( "tr" );
		cell = document.createElement( "td" );
		checkBox = document.createElement( "input" );
		checkBox.type = "checkbox";
		checkBox.id = WFA_OPTIONS.IGNORE_POSTS_ID;
		
		var applyIgnoredPostOpacity = WFA.getIgnorePosts();
		
		if( typeof(applyIgnoredPostOpacity) == "undefined" )
		{
			applyIgnoredPostOpacity = 1;
		}
		
		checkBox.checked = applyIgnoredPostOpacity;
		checkBox.addEventListener('click',WFA_OPTIONS.onclick, true );
		cell.appendChild( checkBox );
		row.appendChild( cell );
		
		cell = document.createElement( "TD" );
		cell.innerHTML = "Gray ignored posts";
		row.appendChild( cell );
		optionsSubPane.appendChild( row );
		
		var button = document.createElement( "INPUT" );
		button.type = "button";
		button.addEventListener( 'click', function(){window.location.reload()}, true );
		button.value = "Reload page";
		button.style.marginBottom = '5px';
		button.style.display = "block";
		button.style.visibility = "hidden";
		button.style.marginLeft = '25px';
		WFA_OPTIONS.reloadButton = button;
		
		
		var wowProgress = document.createElement( "SPAN" );
		wowProgress.style.fontSize = "8px";
		wowProgress.innerHTML = 'Powered By: <a href="http://wowprogress.com">WowProgress</a>';
		
		optionsPane.appendChild( optionsSubPane );
		optionsPane.appendChild( button );
		
		if( !WFA.isChrome() )
		{
			var update = document.createElement( "a" );
			update.href = "#";
			update.addEventListener( 'click', function(){WFA_UPDATE.checkForUpdate(true)}, true );
			update.innerHTML = "Check for update?";
			update.style.display = "block";
			optionsPane.appendChild( update );
		}
		
		optionsPane.appendChild( wowProgress );
		document.body.appendChild( optionsPane );
		
		WFA_OPTIONS.optionsPane = optionsPane;
		
		document.body.addEventListener('mouseover',WFA_OPTIONS.onmouseout, true );
	},
	/**************************************************************
	 * Event handler for checkbox clicks. Determines action
	 * by checkbox element ids.
	 *
	 * @param (Event) The fired event object
	 *
	 **************************************************************/
	onclick: function( event )
	{
		var target = event.target;
		if( target && target.id == WFA_OPTIONS.COLOR_BORDER_ID )
		{
			WFA.enableBorderColor( target.checked );
			WFA_OPTIONS.reloadButton.style.visibility = "visible";
		}
		else if( target && target.id == WFA_OPTIONS.IGNORE_POSTS_ID )
		{
			WFA.enableIgnorePosts( target.checked );
			WFA_OPTIONS.reloadButton.style.visibility = "visible";
		}  
		
	},
	/**************************************************************
	 * Event handler mousing over the WFA Options tab. Opens the
	 * main options pane.
	 *
	 * @param (Event) The fired event object
	 *
	 **************************************************************/
	onmouseover: function( event )
	{
		WFA_OPTIONS.show();
	},
	/**************************************************************
	 * Event handler for mouse movements on the document body.
	 *
	 * @param (Event) The fired event object
	 *
	 **************************************************************/
	onmouseout: function( event )
	{
		if( WFA_OPTIONS.isOpen )
		{
			var target = event.target;
			
			while( target )
			{
				if( target == WFA_OPTIONS.optionsPane )
				{
					break;   
				}
				else if( target == document.body )
				{
					target = null;
					break;   
				}
				target = target.parentNode;   
			}
			
			if( !target )
			{
				WFA_OPTIONS.hide();
			}
		}
	}
}

//Namespace for functionality dealing with Grease Monkey script update notification
var WFA_UPDATE = 
{
	LAST_CHECK_PROPERTY: "wfa_lastUpdateCheck", //storage global names
	LATEST_VERSION_PROPERTY: "wfa_currentVersion",
	CHECK_INTERVAL: 86400000, //once a day in miliseconds update check frequencey
	isUpdateNotifyShown: false, //if the update notify is currently shown
	/**************************************************************
	 * Checks to see if an update check is currently required by
	 * checking userscripts.org.
	 *
	 * @returns True/false
	 *
	 **************************************************************/
	checkRequired: function()
	{
		var isRequired = false;
		var lastCheck = localStorage.getItem( WFA_UPDATE.LAST_CHECK_PROPERTY );
		
		if( lastCheck )
		{
			lastCheck = parseInt( lastCheck );	
			var now = (new Date()).getTime();
			
			if( now - lastCheck > WFA_UPDATE.CHECK_INTERVAL )
			{
				isRequired = true;	
			}
		}
		else
		{
			isRequired = true;
		}
		return isRequired;
	},
	/**************************************************************
	 * Checks to see if an update is requied based on cached
	 * information or a forced user check.
	 *
	 * @param (Boolean) forced Whether this is a forced user check and should ignore caches.
	 *
	 **************************************************************/
	checkForUpdate: function( forced )
	{
		if( WFA_UPDATE.checkRequired() || forced )
		{
			var now = (new Date()).getTime();
			localStorage.setItem( WFA_UPDATE.LAST_CHECK_PROPERTY, now );
			var requestUrl = 'http://userscripts.org/scripts/source/70501.user.js';
			
    		GM_xmlhttpRequest(
    		{
    			method: 'GET',
    			url: requestUrl,
    			headers: 
    			{
    				'Accept': 'text/html,text/javascript,text/json',
    			},
    			onload: function(response){WFA_UPDATE.onCheckRequest(response, forced)}
		    });	
		}
		else
		{
			
			var latestVersion = parseInt( localStorage.getItem( WFA_UPDATE.LATEST_VERSION_PROPERTY ) );
			var curVersion = parseInt( WFA_VERSION.replace( /_/g, '' ) );
			
			if( latestVersion && latestVersion != NaN && latestVersion > curVersion )
			{
				WFA_UPDATE.notifyUpdate();
			}
			else if( forced )
			{
				alert( 'No updates' );
			}
			
				
		}
		
	},
	/**************************************************************
	 * Displays a notification div w/ install link
	 *
	 **************************************************************/
	notifyUpdate:function()
	{
		if( !WFA_UPDATE.isUpdateNotifyShown )
		{
			WFA_UPDATE.isUpdateNotifyShown = true;
			var div = document.createElement( "DIV" );

			div.style.position = "fixed";
			div.style.width = "300px";
			div.style.lineHeight = "10px";
			div.style.fontSize = "10px";
			div.style.fontFamily = "sans-serif";
			div.style.color = "white";
			div.style.height = "12px";
			div.style.backgroundColor = "black";
			div.style.border = "1px solid grey";
			div.style.bottom = "0px";
			div.style.right = "125px";
			div.style.textAlign = "center";
			div.style.zIndex = 1;
			div.innerHTML = "WFA Options";
			
			div.innerHTML = 'An update is available, click <a href="http://userscripts.org/scripts/source/70501.user.js">here</a> to install';
			document.body.appendChild( div );
		}
	},
	/**************************************************************
	 * Callback handler for userscripts.org checks. Parses
	 * out the version on the site and compares to the locally
	 * defined value.
	 *
	 * @param (Object) xmlHttpRequest response object
	 * @param (Boolean) forced If this was a user forced check
	 **************************************************************/
	onCheckRequest:function( response, forced )
	{
		if( response && response.responseText )
		{
			var curVersion = parseInt( WFA_VERSION.replace( /_/g, '' ));
            var matches = response.responseText.match( /^var WFA_VERSION = "_____(\d+)_____";$/m );
            if( matches )
            {
            	var matchedVersion = parseInt( matches[1] );
            	if( matchedVersion && matchedVersion != NaN )
            	{
            		localStorage.setItem( WFA_UPDATE.LATEST_VERSION_PROPERTY, matchedVersion );
	            	if( matchedVersion > curVersion )
	            	{
	            		WFA_UPDATE.notifyUpdate();	
	            	}
	            	else if( forced )
					{
						alert( 'No updates' );
					}
	            }
            }
		}
	}
}


WFA_WowPost = 
{
	POST_BLUE: 'BLUE',
	POST_PLAYER: 'GENERAL',
	POST_GREEN: 'GREEN',
	POST_UNKNOWN: 'UNKNOWN',
	prototype:
	{
		playeName: '',
		playerNode: null,
		guildName: '',
		guildNode: null,
		realmName: '',
		region: '',
		attachNode: '',
		node: null,
		guildLink: '',
		type: '',
		_index: '',
		init:function( node, region )
		{
			this.type = WFA_WowPost.POST_UNKNOWN;
			this.node = node;
			this.region = region;
		},
		isBlue:function()
		{
			return this.type == WFA_WowPost.POST_BLUE;	
		},
		isGreen:function()
		{
			return this.type == WFA_WowPost.POST_GREEN;	
		},
		addRank:function( label, labelColor, value, valueColor )
		{
			var rank = document.createElement( "DIV" );
			rank.innerHTML = '<div><span style="color:'+ labelColor +'">' + label + ':</span><span style="color:'+ valueColor +'"> '  + value + '</span></div>';
			this.attachNode.appendChild( rank );
		},
		update:function()
		{
			var obj = this;
			var callBack = function( rankInfo ){ obj.updateCallBack( rankInfo ) }
			WFA.getGuildRankInfo( this.region, this.realmName,  this.guildName, callBack );
		},
		updateCallBack:function( rankInfo )
		{

			if( rankInfo && typeof(rankInfo) == 'object' && rankInfo.world_rank )
			{
				this.addRank( 'World', '#FFFFFF', rankInfo.world_rank, WFA.getRankColor( rankInfo.world_rank ) );
				this.addRank( this.region, '#FFFFFF', rankInfo.area_rank, WFA.getRankColor( rankInfo.area_rank ) );
			}
			else
			{
				if( WFA.getIgnorePosts() )
				{
					this.fade();	
				}
			}
		},
		parseGuildName: function( armoryLink )
		{
			var url = unescape( armoryLink );
			var values = url.match( GUILD_LINK_PARSER );
			return values[2]
		},
		parseRealmName: function( armoryLink )
		{
			var url = unescape( armoryLink );
			var values = url.match( GUILD_LINK_PARSER );
			return values[1]
		},
		fade: function()
		{
			if( this.node )
			{
				this.node.style.opacity = WFA.ignoredPostOpacity;
			}
		}
	}
};

WFA_BnetPost =
{
	prototype:
	{
		init:function( node, region )
		{
			WFA_WowPost.prototype.init.apply( this, arguments );
			
			var guildNode = this.getGuildNode();
			if( guildNode )
			{
				this.guildLink = this.getGuildNode().href;
				this.guildName = this.parseGuildName( this.guildLink );
				this.realmName = this.parseRealmName( this.guildLink );	
			}

			var playerNode = this.getPlayerNode();
			if( playerNode )
			{
				this.playerName = this.getPlayerNode().innerText;
			}
			
			this.attachNode = this.getAttachNode();

			if( hasClass( node, 'community' ) )
			{
				this.type = WFA_WowPost.POST_GREEN;	
			}
			else
			{
				this.type = WFA_WowPost.POST_PLAYER;
			}
		},
		computeGuildNode: function()
		{
			var result = document.evaluate( '//x:div[@id="'+this.node.id+'"]//x:div[@class="guild"]//x:a', this.node, nameSpaceResolver, XPathResult.ANY_TYPE, null );
			return result.iterateNext();
		},
		getGuildNode: function()
		{
			if( !this.guildNode )
			{
				this.guildNode = this.computeGuildNode();	
			}
			return this.guildNode;
		},
		computePlayerNode: function()
		{
			var result = document.evaluate( '//x:div[@id="'+this.node.id+'"]//x:div[@class="user-name"]/x:a[@class="context-link"]', this.node, nameSpaceResolver, XPathResult.ANY_TYPE, null );
			return result.iterateNext();
		},
		getPlayerNode: function()
		{
			if( !this.playerNode )
			{
				this.playerNode = this.computePlayerNode();	
			}
			return this.playerNode;
		},
		getAttachNode: function()
		{
			var result = document.evaluate( '//x:div[@id="'+this.node.id+'"]//x:div[@class="character-info"]', this.node, nameSpaceResolver, XPathResult.ANY_TYPE, null );
			return result.iterateNext();
		}
	}
};

WFA_BnetPostBlue = 
{
	prototype:
	{
		init:function( node, region )
		{
			this.guildName = ''
			this.realmName = '';
			this.region = region;
			this.playerName = '';
			this.attachNode = null;
			this.type = WFA_WowPost.POST_BLUE;
		},
		addRank: emptyFunction,
		update: emptyFunction,
		updateCallBack: emptyFunction
	}	
}

WFA_WowPost = classify( WFA_WowPost )
WFA_BnetPost = classify( WFA_BnetPost, WFA_WowPost );
WFA_BnetPostBlue = classify( WFA_BnetPostBlue, WFA_WowPost );

//Restore previous options, must be done before any processing
//or options are useless.
WFA.loadOptions();

WFA.restoreCache();

window.addEventListener( "beforeunload", WFA.saveCache, true );

var postsArray = WFA.getPosts();
var forumInfo = WFA.getForumInfo();
var posts = [];
var thisPost = null;
var postObj = null;
for( var i = 0; i < postsArray.length; i++ )
{
		thisPost = postsArray[i];
		postObj = null;
		if( forumInfo.isBnet )
		{
			if( hasClass( thisPost, 'blizzard' ) )
			{
				postObj = new WFA_BnetPostBlue( thisPost, forumInfo.region );
			}
			else
			{
				postObj = new WFA_BnetPost( thisPost, forumInfo.region );
			}
		}
		else
		{
			postObj = new WFA_WowPost( thisPost, forumInfo.region );
		}
		postObj._index = i;
		posts.push( postObj );
}

posts[1].guildName = "howdy";

for( var i = 0; i < posts.length; i++)
{
	posts[i].update();	
}


//create & show the options pane
WFA_OPTIONS.initialize();

if( !WFA.isChrome() )
{
	WFA_UPDATE.checkForUpdate();
}