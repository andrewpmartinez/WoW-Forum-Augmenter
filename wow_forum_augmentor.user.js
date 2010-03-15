// ==UserScript==
// @name		   WoW Forum Augmentor
// @namespace	  WFA
// @description	Enhances World of Warcraft NA/EU forums with WoW Progress scores
// @include		http://forums.worldofwarcraft.com/*
// @include		http://forums.wow-europe.com/*
// ==/UserScript==

var WFA =
{
	worldThreshold: 100, //not used yet
	localThreshold: 100, //not used yet
	realmThreshold: 3, //not used yet
	ignoredPostOpacity: 0.5, //ok to change, the % oppacity to apply to ignored posts. Values are 0->1 (0 = 0% invisible, 1 = 100% no change, 50% = half transparent.
	applyIgnoredPostOpacity: true, //ok to change, whether posts w/o rank, low rank, or no progression should be greyed out (default=true)
	applyColorPostBorder: true, //ok to change, whether the border around each post should also be colored (default=true)
	maxEntryAge: 86400, //ok to change, value in seconds. Maximum length of time any one record should be kept (86400s = 24hrs)
	maxCacheAge: 86400, //ok to change, value in seconds. Maximum length of time to keep the entire cache (86400s = 24hrs)
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
	 * @param (HTML Object) An HTML node reference to a forum post
	 * @todo: Change post to be a callback functor in order to
	 *		  decouple response behaviour.
	 *
	 * @returns WFA.IS_REQUEST, WFA.FAILED_REQUEST, or a rank
	 *			info object: {score:,world_rank,area_rank:}
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
	 * @param (HTML Object) An HTML node reference to a forum post
	 * 
	 * @todo: Change post to be a callback functor in order to
	 *		  decouple response behaviour.
	 *
	 * @returns WFA.IS_REQUEST, WFA.FAILED_REQUEST, or a rank
	 *			info object: {score:,world_rank,area_rank:}
	 *
	 **************************************************************/
	requestRank: function( area, realm, guild, post, onRequest )
	{
		var key = WFA.generateGuildRealmKey( area, realm, guild );
		area = area.replace( /'/g, '-' ).replace( /\s/g, "+").toLowerCase();;
		realm = realm.replace( /'/g, '-' ).replace( /\s/g, "-").toLowerCase();
		guild = guild.replace( /'/g, '-' ).replace( /\s/g, "+");
		var requestUrl = 'http://www.wowprogress.com/guild/'+area+'/'+realm+'/'+guild+'/json_rank';


        if( WFA.isChrome() )
        {
        	chrome.extension.sendRequest({'action' : 'fetchGuildRank', 'requestUrl':requestUrl}, function(responseDetails){WFA.onRequest( responseDetails, key,area, realm, guild, post)});
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
    			onload: function(responseDetails){WFA.onRequest( responseDetails, key,area, realm, guild, post)}
		    });	
        }
		
	},
	onRequest: function(responseDetails, key, area, realm, guild, post)
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
		var world = WFA.getRankColor( info.world_rank );
		var area = WFA.getRankColor( info.area_rank );
		var areaText = WFA.getForumArea();
		return 'World: <span style="color:'+world+'">' + info.world_rank + '<span><BR>'+areaText+': <span style="color:'+area+'">' + info.area_rank + '</span>';
		
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
			GM_setValue( 'applyColorPostBorder', 1 ) 
		}
		else
		{
			WFA.applyColorPostBorder = 0;
			GM_setValue( 'applyColorPostBorder', 0 ) 
		}   
	},
	/**************************************************************
	 * Set the option of whether to grey posts out
	 *
	 * @param (Boolean) shouldIgnore To grey posts or not
	 *
	 **************************************************************/
	setIgnorePosts: function( shouldIgnore )
	{
		if( shouldIgnore )
		{
			WFA.applyIgnoredPostOpacity = 1;
			GM_setValue( 'applyIgnoredPostOpacity', 1 )
		}
		else
		{
			WFA.applyIgnoredPostOpacity = 0;
			GM_setValue( 'applyIgnoredPostOpacity', 0 )
		}   
	},
	/**************************************************************
	 * Return whether post borders are being greyed out to ignore
	 * or not.
	 *
	 * @returns (Number) 1 greyed 0 not
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

    	WFA.setApplyBorderColor( parseInt(GM_getValue( 'applyColorPostBorder' ) || '0' ) );
    	WFA.setIgnorePosts( parseInt( GM_getValue( 'applyIgnoredPostOpacity' ) || '1' ) );   

	}
	
}

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
		optionsPane.style.width = "125px";
		optionsPane.style.lineHeight = "10px";
		optionsPane.style.fontSize = "10px";
		optionsPane.style.fontFamily = "sans-serif";
		optionsPane.style.color = "white";
		optionsPane.style.height = "100px";
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
		WFA_OPTIONS.reloadButton = button;
		
		var wowProgress = document.createElement( "SPAN" );
		wowProgress.style.fontSize = "8px";
		wowProgress.innerHTML = 'Powered By: <a href="http://wowprogress.com">WowProgress</a>';
		
		optionsPane.appendChild( optionsSubPane );
		optionsPane.appendChild( button );
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


if( WFA.isChrome() )
{
    window.GM_getValue = function( property )
    {
        return window.localStorage.getItem(property);
    };
    window.GM_setValue = function( property, value)
    {
        window.localStorage.setItem(property, value);  
    };   
    
}

//make sure this is a supported forum area
var area = WFA.getForumArea();
WFA.loadOptions();

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
			var guild = WFA.cleanGuildName( unescape( String(guildNode.href).match( /(\?|&)n=(.*?)(&|$)/ )[2])  );
			var realm = WFA.cleanRealmName( unescape( String(guildNode.href).match( /(\?|&)r=(.*?)(&|$)/ )[2]) );
			
			WFA.processPost( area, realm, guild, thisPost );
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

WFA_OPTIONS.initialize();