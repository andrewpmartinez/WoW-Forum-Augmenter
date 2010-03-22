// ==UserScript==
// @name		   WoW Forum Augmentor
// @namespace	  WFA
// @description	Enhances World of Warcraft NA/EU forums with WoW Progress scores
// @include		http://forums.worldofwarcraft.com/*
// @include		http://forums.wow-europe.com/*
// ==/UserScript==

var WFA_VERSION = "_____17_____";

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
	PVP_REQUEST_TIMEOUT:2000,
	lastPvpRequest:0,
	pvpTimeout:null,
	requestPvP:false, //careful turning this on can get you a 12hr ban from wowarmory.com
	MAX_CACHE_ENTRIES: 10000, //if localStorage is UTF-16 this is a very conservative guess to stay under the 5mb limit of storage
	pvpRequestQueue:[],
	
	/**************************************************************
	 * Returns the two digit forum area/locale of the current 
	 * WoW forum being browsed.
	 *
	 * Example: 'US' 'EU'
	 *
	 * @returns A two digit string representing the forum locale
	 *
	 **************************************************************/
	getForumArea: function()
	{
		var area = '';
		var url = document.location;
		if( String(url).match( /forums\.wow-europe\.com/ ) )
		{
			area = 'EU';	
		}
		else if( String(url).match( /forums\.worldofwarcraft\.com/ ) )
		{
			area = 'US';
		}
		return area;
	},
	keys: function(o){ var a = []; for (var k in o) a.push(k); return a; },
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
	generatePlayerKey: function( area, realm, player )
	{
		return String( 'p_' + area + "_" + realm + "_" + player).toLowerCase();
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
	getPvpRankInfo: function( area, realm, name, callBack )
	{
		if( area && realm && name )
		{
			var key = WFA.generatePlayerKey( area, realm, player );
			
			if( (!WFA.rankCache[key] || ((new Date()) - WFA.rankCache[key].timestamp) > WFA.maxEntryAge) )
			{
				WFA.requestPvpRank( area, realm, player, callBack );
			}
			else
			{
				callBack( WFA.rankCache[key].value );
			}
		}
		
	},
	startPvpRequestPoll:function()
	{
		if( !WFA.pvpTimeout )
		{
			WFA.pvpTimeout = setTimeout( WFA.pvpRequestTimout, WFA.PVP_REQUEST_TIMEOUT );
		}
	},
	pvpRequestTimout:function()
	{
		WFA.pvpTimeout = null;
		WFA.doNextPvpRequest();
		
		if( WFA.hasQueuedPvpRequest() )
		{
			WFA.startPvpRequestPoll();
		}
	},
	requestPvpRank: function( area, realm, player, callBack )
	{
		var now = (new Date()).getTime();
		if( !WFA.lastPvpRequest || now - WFA.lastPvpRequest > WFA.PVP_REQUEST_TIMEOUT )
		{
			WFA.lastPvpRequest = now;
			var key = WFA.generatePlayerKey( area, realm, player );
	
			var requestUrl = '';
			
			if( area == 'US' )
			{
				requestUrl = "http://www.wowarmory.com/character-sheet.xml?";
			}else if( area == 'EU' )
			{
				requestUrl = "http://eu.wowarmory.com/character-sheet.xml?";
			}
	
			requestUrl = requestUrl + 'r='+escape(realm)+'&cn='+escape(player) + '&rhtml=n';
	
	        if( WFA.isChrome() )
	        {
	        	chrome.extension.sendRequest({'action' : 'fetchPvpRank', 'requestUrl':requestUrl}, function(responseDetails){WFA.onRequest( responseDetails, key,area, realm, guild, callBack)});
	        }
	        else
	        {
				console.log( 'Requesting pvp info' );
	    		GM_xmlhttpRequest(
	    		{
	    			method: 'GET',
	    			url: requestUrl,
	    			headers: 
	    			{
	    				'User-Agent': 'Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US; rv:1.9.2) Gecko/20100115 Firefox/3.6',
	    				'Accept': 'application/xml;charset=UTF-8,application/xml,text/xml',
	    			},
	    			onload: function(responseDetails){WFA.onPvpRequest( responseDetails, key,area, realm, player, callBack)}
			    });	
	        }
		}
		else
		{
			var request = function(){WFA.requestPvpRank( area, realm, player, callBack )};
			WFA.pvpRequestQueue.push( request );
			WFA.startPvpRequestPoll();
		}
	},
	hasQueuedPvpRequest:function()
	{
		return WFA.pvpRequestQueue.length > 0;	
	},
	doNextPvpRequest:function()
	{
		if( WFA.hasQueuedPvpRequest() )
		{
			var request = WFA.pvpRequestQueue.pop();
			request();
		}	
	},
	onPvpRequest: function(responseDetails, key,area, realm, player, callBack )
	{
		
		if( responseDetails.responseText )
		{
			var pvpRanks = {2:{},3:{},5:{}};
			var parser = new DOMParser();
			
			if( !responseDetails.responseText.match( /_layout\/error\/error.xsl/ ) )
			{
				try
				{
					var doc = parser.parseFromString(responseDetails.responseText,"text/xml");
					
					var rankNodes = doc.evaluate( "//arenaTeam", doc, null, XPathResult.ANY_TYPE, null );
					
					var curRank = rankNodes.iterateNext();

					while( curRank )
					{
						pvpRanks[curRank.getAttribute("teamSize")] = {rating:curRank.getAttribute("rating"),rank:curRank.getAttribute("ranking"),url:curRank.getAttribute("teamUrl")};
						curRank = rankNodes.iterateNext();	
					}

					WFA.rankCache[key] = {value: pvpRanks, timestamp:(new Date()).getTime() };
					
					if( typeof(callBack) == 'function' )
					{
						callBack( pvpRanks );
					}
				}
				catch(e)
				{
					//...banned from wowarmory?
				}
			}
		}
	},
	/**************************************************************
	 * Cleans a guilds name by removing left and right angle
	 * angle brackets as well as white space trimming.
	 *
	 * e.g. ' < Some Guild > ' -> 'Some Guild'
	 * 
	 * @param (String) guildName The name of a guild to clean
	 * @returns A clean guild name string
	 *
	 **************************************************************/
	cleanGuildName: function( guildName )
	{
		return guildName.replace( /(^\s*&lt;\s*|\s*&gt;$)/g, '' );
	},
	/**************************************************************
	 * Cleans a realm name.
	 *
	 * e.g. ' Realm Name ' -> 'Realm Name'
	 * 
	 * @param (String) realmName The name of a realm to clean
	 * @returns A clean realm name string
	 *
	 **************************************************************/
	cleanRealmName: function( realmName )
	{
		return realmName.replace( /(^\s*|\s*$)/g, '' );
	},
	/**************************************************************
	 * Styles a post based on rank information.
	 *
	 * 
	 * @param (HTML Object) post An HTML node reference to a post
	 * @param (Object) rankInfo A rank info object
	 *
	 **************************************************************/
	stylePost: function( post, rankInfo, pvpRankInfo )
	{
		
			if( !rankInfo || !rankInfo.score || (rankInfo.world > WFA.worldThreshold && rank.info && rankInfo.local > WFA.localThreshold && rankInfo.realm > WFA.realmThreshold ) )
			{
				if( WFA.applyIgnoredPostOpacity )
				{
					post.style.opacity = WFA.ignoredPostOpacity;
				}
			}
			
			
			var realmNode = WFA.getRealmNode( post );
			
			if( realmNode )
			{
				var newNode = document.createElement( "DIV");
				newNode.style.color = "#CCCCCC";
				
				if( WFA.applyColorPostBorder && rankInfo && rankInfo.score )
				{
					var minRank = Math.min( rankInfo.world_rank, rankInfo.area_rank );
					var borderColor = WFA.getRankColor( minRank );
					var innerBorderElement = WFA.getBorderElement( post );
					innerBorderElement.style.borderColor = borderColor;
				}
	
				newNode.innerHTML = WFA.buildRankText( rankInfo, pvpRankInfo );
				realmNode.parentNode.parentNode.appendChild( newNode );	
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
		area = area.replace( /'/g, '-' ).replace( /\s/g, "+").toLowerCase();;
		realm = realm.replace( /'/g, '-' ).replace( /\s/g, "-").toLowerCase();
		guild = guild.replace( /'/g, '-' ).replace( /\s/g, "+");
		var requestUrl = 'http://www.wowprogress.com/guild/'+area+'/'+escape(realm)+'/'+escape(guild)+'/json_rank';

        if( WFA.isChrome() )
        {
        	chrome.extension.sendRequest({'action' : 'fetchGuildRank', 'requestUrl':requestUrl}, function(responseDetails){WFA.onRequest( responseDetails, key,area, realm, guild, callBack)});
        }
        else
        {
			console.log('Requesting guild info' );
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
		
		var responseObj = {"score":"","world_rank":"","area_rank":"","realm_rank":""};
		
		if( responseDetails.responseText )
		{
			eval( "responseObj = " + responseDetails.responseText );
		}
		
		if( !responseObj )
		{
			responseObj = WFA.FAILED_REQUEST;	
		}
		
		WFA.rankCache[key] = {value: responseObj, timestamp:(new Date()).getTime() };
		
		if( typeof(callBack) == 'function' )
		{
			callBack( responseObj );
		}
		
	},
	/**************************************************************
	 * Returns the HTML element that contains a post's guild 
	 * text.
	 *
	 * @param (HTML Object) post A HTML node reference to an element
	 *					  that represents a post.
	 * @returns (HTML Object) A HTML node reference to the element
	 *						that holds the guild text.
	 *
	 **************************************************************/
	getGuildNode: function( post )
	{
		var guildNode = document.evaluate( ".//li[@class='icon-guild']/small/b/a", post,null, XPathResult.ANY_TYPE, null );
		return guildNode.iterateNext();
	},
	getPlayerNode: function( post )
	{
		var playerNode = document.evaluate( ".//div[@class='chardata']/span/b/a", post,null, XPathResult.ANY_TYPE, null );
		return playerNode.iterateNext();
	},
	/**************************************************************
	 * Returns the HTML element that contains a post's realm 
	 * text.
	 *
	 * @param (HTML Object) post A HTML node reference to an element
	 *					  that represents a post.
	 * @returns (HTML Object) A HTML node reference to the element
	 *						that holds the realm text.
	 *
	 **************************************************************/
	getRealmNode: function( post )
	{
		var realmNode = document.evaluate( ".//li[@class='icon-realm']/small/b", post, null, XPathResult.ANY_TYPE, null );
		return realmNode.iterateNext();
	},
	/**************************************************************
	 * Returns the HTML element that contains a post's border.
	 *
	 * @param (HTML Object) post A HTML node reference to an element
	 *					  that represents a post.
	 * @returns (HTML Object) A HTML node reference to the element
	 *						that represents a post's border.
	 *
	 **************************************************************/
	getBorderElement: function( post )
	{
		var element = document.evaluate( ".//div[@class='innerborder']", post, null, XPathResult.ANY_TYPE, null );
		return element.iterateNext();
	},
	/**************************************************************
	 * Returns true/false if the post is a Blizzard employee post
	 *
	 * @param (HTML Object) post A HTML node reference to an element
	 *					  that represents a post.
	 * @returns (Boolean) True/false if this is a blue post
	 *
	 **************************************************************/
	isBluePost: function( post )
	{
		var isBlue = false;
		var element = document.evaluate( ".//span[@class='blue']", post, null, XPathResult.ANY_TYPE, null );
		element = element.iterateNext();
		if( element )
		{
			isBlue = true;
		}
		return isBlue;
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
		rank = parseInt( rank );
		if( !isNaN(rank) )
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
		}
		
		return '';
		
	},
	/**************************************************************
	 * Builds a HTML string of text that can be used to represent
	 * a guilds status.
	 *
	 * @param (Object) info Guild rank information
	 * @returns (String) A string of HTML text
	 *
	 **************************************************************/
	buildRankText: function( info, pvpInfo )
	{
		info = info || {world_rank:null,area_rank:null,score:null,realm:null};
		pvpInfo = pvpInfo || {2:{}, 3:{}, 5:{} };
		var world = WFA.getRankColor( info.world_rank );
		var area = WFA.getRankColor( info.area_rank );
		var realm = WFA.getRankColor( info.realm_rank );
		var twoColor = WFA.getRankColor( pvpInfo[2].rank )
		var threeColor = WFA.getRankColor( pvpInfo[3].rank );
		var fiveColor = WFA.getRankColor( pvpInfo[5].rank )
		
		var worldRank = parseInt( info.world_rank ) || '-';
		var areaRank = parseInt( info.area_rank ) || '-';
		var realmRank = parseInt( info.realm_rank ) || '-';
		
		var twoRank = parseInt( pvpInfo[2].rank ) || '-';
		var threeRank = parseInt( pvpInfo[3].rank ) || '-';
		var fiveRank = parseInt( pvpInfo[5].rank ) || '-';
		
		var areaText = WFA.getForumArea();
		
		return '<table style="text-align:right;display:inline;padding:0px;font-size:7pt"><tr><td style="padding:0px;" >World</td><td style="padding:0px 5px 0px 2px;" ><span style="color:'+world+'">' + worldRank + '</span></td><td style="padding:0px;" >2v2</td><td style="color:'+ twoColor+';padding:0px 5px 0px 2px;" >'+ twoRank +'</td></tr>' +
'<tr><td style="padding:0px;" >'+areaText+'</td><td style="padding:0px 5px 0px 2px;" ><span style="color:'+area+'">' + areaRank + '</span></td><td style="padding:0px;" >3v3</td><td style="color:'+ threeColor+';padding:0px 5px 0px 2px;" >'+ threeRank +'</td></tr>' +
'<tr><td style="padding:0px;" >Realm</td><td style="padding:0px 5px 0px 2px;" ><span style="color:'+realm+'">' + realmRank + '</span></td><td style="padding:0px;" >5v5</td><td style="color:'+ fiveColor+';padding:0px 5px 0px 2px;" >'+ fiveRank +'</td></tr></table>';

		
	},
	/**************************************************************
	 * Attempts to obtain information about a guild and style
	 * posts from members of that guild according to their rank.
	 *
	 * @param (String) area Two digit area locale
	 * @param (String) realm A WoW realm server name
	 * @param (String) guild A WoW guild located in the 
	 *				 specified area & realm
	 * @param (HTML Object) An HTML node reference to a forum post
	 **************************************************************/
	processPost: function( area, realm, guild, player, post )
	{
		if( WFA.isBluePost( post ) && WFA.applyColorPostBorder )
		{
			var innerBorderElement = WFA.getBorderElement( post );
			innerBorderElement.style.borderColor = WFA.COLOR_BLUE;
		}
		else
		{
			var callBack = function(guildRankInfo)
			{
				if( WFA.requestPvP )
				{
					WFA.getPvpRankInfo( area, realm, player, function(pvpRank)
					{
						WFA.stylePost( post, guildRankInfo, pvpRank );	
					} );
				}
				else
				{
					WFA.stylePost( post, guildRankInfo, null );	
				}
			}
			
			WFA.getGuildRankInfo( area, realm, guild, callBack );
		}
	},
	/**************************************************************
	 * Set the option of whether to apply border colors or not.
	 *
	 * @param (Boolean) shouldColor To add colored borders or not
	 *
	 **************************************************************/
	setApplyBorderColor: function( shouldColor )
	{
		if( shouldColor )
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
	setIgnorePosts: function( shouldIgnore )
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

    	WFA.setApplyBorderColor( parseInt(WFA.getSavedValue( 'applyColorPostBorder' ) || '0' ) );
    	WFA.setIgnorePosts( parseInt( WFA.getSavedValue( 'applyIgnoredPostOpacity' ) || '1' ) );   

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
		var optionsPane = document.createElement("DIV");
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
		
		var optionsSubPane = document.createElement("TABLE");
		var row = document.createElement( "TR" );
		var cell = document.createElement( "TD" );
		var checkBox = document.createElement( "INPUT" );
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
		
		cell = document.createElement( "TD" );
		cell.innerHTML = "Color post borders";
		row.appendChild( cell );
		optionsSubPane.appendChild( row );
		
		row = document.createElement( "TR" );
		cell = document.createElement( "TD" );
		checkBox = document.createElement( "INPUT" );
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
			WFA.setApplyBorderColor( target.checked );
			WFA_OPTIONS.reloadButton.style.visibility = "visible";
		}
		else if( target && target.id == WFA_OPTIONS.IGNORE_POSTS_ID )
		{
			WFA.setIgnorePosts( target.checked );
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



//make sure this is a supported forum are else we can't be 
//sure that CSS class names/DOM hierarchy is compatible.
var area = WFA.getForumArea();

//Restore previous options, must be done before any processing
//or options are useless.
WFA.loadOptions();


WFA.restoreCache();

window.addEventListener( "beforeunload", WFA.saveCache, true );

if( area )
{
	//obtain all posts and being to query for rank information
	var posts = document.evaluate( "//div[@class='postdisplay']", document,null, XPathResult.ANY_TYPE, null );
	
	var curPost = posts.iterateNext();
	var guildNode = '';
	var playerNode = '';
	var postsArray = [];
	
	while( curPost )
	{
		postsArray.push( curPost );	
		//store in a custom array. Had issues w/ a mutating iterators when posts were changed in this loop.
		curPost = posts.iterateNext();
	}
	
	for( var i = 0; i < postsArray.length; i++ )
	{
		var thisPost = postsArray[i];
		
		//only need guild node as the URL to the armory will be parsed for
		//realm and guild name. Previously parsing innerHTML text proved to
		//be unreliable for long guild names. Longer names would be cut
		//off at the end and have ellipses (...)
		guildNode = WFA.getGuildNode( thisPost );
		playerNode = WFA.getPlayerNode( thisPost );
		if( (guildNode )  )
		{
			var guild = WFA.cleanGuildName( unescape( String(guildNode.href).match( /(\?|&)n=(.*?)(&|$)/ )[2]) );
			var realm = WFA.cleanRealmName( unescape( String(guildNode.href).match( /(\?|&)r=(.*?)(&|$)/ )[2]) );
			var player = unescape( String(playerNode.href).match( /(\?|&)n=(.*?)(&|$)/ )[2] );

			WFA.processPost( area, realm, guild, player, thisPost );
		}
		else if( WFA.isBluePost( thisPost ) )
		{
			WFA.processPost( area, '', '', thisPost );
		}
		else
		{
			//style no info posts
			WFA.stylePost( thisPost, null );
		}	
	}

}


//create & show the options pane
WFA_OPTIONS.initialize();

if( !WFA.isChrome() )
{
	WFA_UPDATE.checkForUpdate();
}



GM_xmlhttpRequest(
{
	method: 'GET',
	url: 'http://www.wowprogress.com/export/ranks/us_mal-ganis_tier10_25.json.gz',
	headers: 
	{
		'Accept': 'text/html,text/javascript,text/json,application-json/text',
		'Accept-Encoding': 'gzip,deflate'
	},
	onload: function(response){console.log( response.responseText);}
});	


//http://www.wowprogress.com/export/ranks/us_mal-ganis_tier10_25.json.gz