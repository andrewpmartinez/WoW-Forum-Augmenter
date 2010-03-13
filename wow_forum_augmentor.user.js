// ==UserScript==
// @name           WoW Forum Augmentor
// @namespace      WFA
// @description    Enhances World of Warcraft NA/EU forums with WoW Progress scores
// @include        http://forums.worldofwarcraft.com/*
// @include        http://forums.wow-europe.com/*
// @require        http://code.jquery.com/jquery-1.4.2.min.js
// ==/UserScript==

var WFA =
{
	worldThreshold: 100, //not used yet
	localThreshold: 100, //not used yet
	realmThreshold: 3, //not used yet
	ignoredPostOpacity: 0.45, //ok to change, the % oppacity to apply to ignored posts. Values are 0->1 (0 = 0% invisible, 1 = 100% no change, 50% = half transparent.
	applyIgnoredPostOpacity: true, //ok to change, whether posts w/o rank, low rank, or no progression should be greyed out (default=true)
	applyColorPostBorder: true, //ok to change, whether the border around each post should also be colored (default=true)
	maxEntryAge: 86400, //ok to change, value in seconds. Maximum length of time any one record should be kept (86400s = 24hrs)
	maxCacheAge: 86400, //ok to change, value in seconds. Maximum length of time to keep the entire cache (86400s = 24hrs)
	MAX_LEGENDARY: 3,	//maximum world/region rank for legendary status, ok to change, should be higher than 0 and lower than epic
	MAX_EPIC: 25,	//maximum world/region rank for epic status, ok to change should be higher than legendary & lower than rare
	MAX_RARE: 500,	//maximum world/region rank for rare status, ok to change should be higher than epic
	COLOR_LEGENDARY:"#FF8000",	//legendary HTML hex color (orange), ok to change
	COLOR_EPIC: "#A335EE",	//epic HTML hex color (purple), ok to change
	COLOR_RARE: "#0070DD",	//rare HTML hex color (blue), ok to change
	COLOR_COMMON: "#1EFF00",	//rare HTML hex color (green), ok to change
	COLOR_BLUE: "#00C0FF", //blue post border color, ok to change
	IS_REQUESTING: 1,	//do not change: constant used to denote a requesting status
	FAILED_REQUEST: 2,	//do not change: constant used to denote a failed request
	rankCache:{}, //do not change
	
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
	/**************************************************************
	 * Creates a unique key string for guild from a specifie
	 * locale and realm.
	 *
	 * @param (String) area Two digit area locale
	 * @param (String) realm A WoW realm server name
	 * @param (String) guild A WoW guild located in the specified 
	 *                 area & realm
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
	 *                 specified area & realm
	 * @param (HTML Object) An HTML node reference to a forum post
	 * @todo: Change post to be a callback functor in order to
	 *		  decouple response behaviour.
	 *
	 * @returns WFA.IS_REQUEST, WFA.FAILED_REQUEST, or a rank
	 *		    info object: {score:,world_rank,area_rank:}
	 * 
	 *
	 **************************************************************/
	getGuildRankInfo: function( area, realm, guildName, post )
	{
		if( guildName && realm )
		{
			var key = WFA.generateGuildRealmKey( area, realm, guildName );
			//not cached or cache is old
			if( !WFA.rankCache[key] || ((new Date()) - WFA.rankCache[key].timestamp) > WFA.maxEntryAge )
			{
				WFA.requestRank( area, realm, guildName, post );
				return WFA.IS_REQUESTING;
			}
			return WFA.rankCache[key].value;
		}
		else
		{
			return null;	
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
	stylePost: function( post, rankInfo )
	{
		
			if( !rankInfo || (rankInfo.world > WFA.worldThreshold && rank.info && rankInfo.local > WFA.localThreshold && rankInfo.realm > WFA.realmThreshold ) )
			{
				if( WFA.applyIgnoredPostOpacity )
				{
					post.style.opacity = WFA.ignoredPostOpacity;
				}
			}
			else
			{
				var realmNode = WFA.getRealmNode( post );
				var newNode = document.createElement( "DIV");
				newNode.style.color = "#CCCCCC";
				
				if( WFA.applyColorPostBorder )
				{
					var minRank = Math.min( rankInfo.world_rank, rankInfo.area_rank );
					var borderColor = WFA.getRankColor( minRank );
					var innerBorderElement = WFA.getBorderElement( post );
					innerBorderElement.style.borderColor = borderColor;
				}

				newNode.innerHTML = WFA.buildRankText( rankInfo );
				realmNode.parentNode.parentNode.appendChild( newNode );				
			}
	},
	/**************************************************************
	 * Requests a guild ranks information from WowProgress.com.
	 *
	 * 
	 * @param (String) area Two digit area locale
	 * @param (String) realm A WoW realm server name
	 * @param (String) guild A WoW guild located in the 
	 *                 specified area & realm
	 * @param (HTML Object) An HTML node reference to a forum post
	 * 
	 * @todo: Change post to be a callback functor in order to
	 *		  decouple response behaviour.
	 *
	 * @returns WFA.IS_REQUEST, WFA.FAILED_REQUEST, or a rank
	 *		    info object: {score:,world_rank,area_rank:}
	 *
	 **************************************************************/
	requestRank: function( area, realm, guild, post, onRequest )
	{
		var key = WFA.generateGuildRealmKey( area, realm, guild );
		area = area.replace( /'/g, '-' ).replace( /\s/g, "+").toLowerCase();;
		realm = realm.replace( /'/g, '-' ).replace( /\s/g, "-").toLowerCase();
		guild = guild.replace( /'/g, '-' ).replace( /\s/g, "+");
		var requestUrl = 'http://www.wowprogress.com/guild/'+area+'/'+realm+'/'+guild+'/json_rank';

		GM_xmlhttpRequest(
		{
			method: 'GET',
			url: requestUrl,
			headers: 
			{
				'User-agent': 'Mozilla/4.0 (compatible) Greasemonkey',
				'Accept': 'text/html,text/javascript,text/json',
			},
			onload: function(responseDetails)
			{
				
				var responseObj = WFA.FAILED_REQUEST;
				
				if( responseDetails.responseText )
				{
					eval( "responseObj = " + responseDetails.responseText );
				}
				
				if( !responseObj )
				{
					responseObj = WFA.FAILED_REQUEST;	
				}
				
				WFA.rankCache[key] = {value: responseObj, timestamp:(new Date()).getTime() };
				WFA.processPost( area, realm, guild, post );
				
			}
		});	
		
	},
	/**************************************************************
	 * Returns the HTML element that contains a post's guild 
	 * text.
	 *
	 * @param (HTML Object) post A HTML node reference to an element
	 *                      that represents a post.
	 * @returns (HTML Object) A HTML node reference to the element
	 *                        that holds the guild text.
	 *
	 **************************************************************/
	getGuildNode: function( post )
	{
		var guildNode = document.evaluate( ".//li[@class='icon-guild']/small/b/a", post,null, XPathResult.ANY_TYPE, null );
		return guildNode.iterateNext();
	},
	/**************************************************************
	 * Returns the HTML element that contains a post's realm 
	 * text.
	 *
	 * @param (HTML Object) post A HTML node reference to an element
	 *                      that represents a post.
	 * @returns (HTML Object) A HTML node reference to the element
	 *                        that holds the realm text.
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
	 *                      that represents a post.
	 * @returns (HTML Object) A HTML node reference to the element
	 *                        that represents a post's border.
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
	 *                      that represents a post.
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
	 * Builds a HTML string of text that can be used to represet
	 * a guilds status.
	 *
	 * @param (Object) info Guild rank information
	 * @returns (String) A string of HTML text
	 *
	 **************************************************************/
	buildRankText: function( info )
	{
		var world = WFA.getRankColor( info.word_rank );
		var area = WFA.getRankColor( info.area_rank );
		var areaText = WFA.getForumArea();
		return 'World: <span style="color:'+world+'">' + info.world_rank + '<span><BR>'+areaText+': <span style="color:'+area+'>' + info.area_rank + '</span>';
		
	},
	/**************************************************************
	 * @param (String) area Two digit area locale
	 * @param (String) realm A WoW realm server name
	 * @param (String) guild A WoW guild located in the 
	 *                 specified area & realm
	 * @param (HTML Object) An HTML node reference to a forum post
	 * 
	 * @todo: Change post to be a callback functor in order to
	 *		  decouple response behaviour.
	 *
	 *
	 **************************************************************/
	processPost: function( area, realm, guild, post )
	{
		if( WFA.isBluePost( post ) )
		{
			var innerBorderElement = WFA.getBorderElement( post );
			innerBorderElement.style.borderColor = WFA.COLOR_BLUE;
		}
		else
		{
			var guildRankInfo = WFA.getGuildRankInfo( area, realm, guild, post );
			if( guildRankInfo && guildRankInfo != WFA.IS_REQUESTING && guildRankInfo.score )
			{
				WFA.stylePost( post, guildRankInfo );	
			}
			else if( !guildRankInfo || guildRankInfo == 2 )
			{
				WFA.stylePost( post, null );	
			}
		}
	}
}

var WFA_OPTIONS = 
{
    built: false,
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
        handle.innerHTML = "WFA Options";
        document.body.appendChild( handle );  
    },
    show: function()
    {
       if( !WFA_OPTIONS.built )
       {
            WFA_OPTION.build();
       }
       
    },
    build: function()
    {
        WFA_OPTIONS.built = true;
    },
    onmouseover: function( event )
    {
        
    },
    onmouseout: function( event )
    {
        
    }
}




//make sure this is a supported forum area
var area = WFA.getForumArea();

if( area )
{
	//obtain all posts and being to query for rank information
	var posts = document.evaluate( "//div[@class='postdisplay']", document,null, XPathResult.ANY_TYPE, null );
	
	var curPost = posts.iterateNext();
	var guildNode = '';
	var realmNode = '';
	var noInfo = [];
	var postsArray = [];
	
	while( curPost )
	{
		postsArray.push( curPost );	
		curPost = posts.iterateNext();
	}
	
	for( var i = 0; i < postsArray.length; i++ )
	{
		var thisPost = postsArray[i];
		guildNode = WFA.getGuildNode( thisPost );
		realmNode = WFA.getRealmNode( thisPost );
		
		if( (guildNode && realmNode)  )
		{
			guildNode = WFA.cleanGuildName( guildNode.innerHTML );
			realmNode = WFA.cleanRealmName( realmNode.innerHTML );
			
			WFA.processPost( area, realmNode, guildNode, thisPost );
		}
		else if( WFA.isBluePost( thisPost ) )
		{
			WFA.processPost( area, '', '', thisPost );
		}
		else
		{
			//save no info posts
			noInfo.push( thisPost );
		}	
	}
	
	for( var i = 0; i < noInfo.length; i++ )
	{
		WFA.stylePost( noInfo[i], null );
	}
}
