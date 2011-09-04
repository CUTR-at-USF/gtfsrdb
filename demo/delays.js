/*
   delays.js: render the IDW layer of current delays

   Copyright 2011 Matt Conway

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

     http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.

   Authors:
   Matt Conway: main code

*/


MAP_PROJ = 'EPSG:900913';
DB_PROJ  = 'EPSG:4326';

// The maximum delay that will be displayed; all others will be truncated to
// this. Seconds.
SCALE_TOP = 10 * 60; // 10 mins
SCALE_BOT = -10 * 60; // -3 mins (i.e. 3 mins early)


function drawHeatmap () {
    $('#load').fadeIn();

    var oldLayer = heat;

    heat = new IDW.Layer();
    heat.attribution = '<br/>Route and arrival data provided by permission of '+
	'<a target="_blank" href="http://www.trimet.org">TriMet.</a>'
    heat.colours = [0x0000ffff, 0x00aa00ff, 0xff0000ff];

    var maxDelay = 0;
    var minDelay = 0;

    // Yay! No XHR issues!
    $.ajax({
	method: 'GET',
	url: '/cgi-bin/delays.py',
	dataType: 'json',
	success: function (data) {
	    var dataLen = data.length;

	    for (var i = 0; i < dataLen; i++) {
		// Truncate the delays to the scale
		if (data[i].avg > SCALE_TOP) avg = SCALE_TOP;
		else if (data[i].avg < SCALE_BOT) avg = SCALE_BOT;
		else avg = data[i].avg;

		source = new IDW.Source(
		    new OpenLayers.LonLat(data[i].stop_lon,
					  data[i].stop_lat)
			.transform(new OpenLayers.Projection(DB_PROJ),
				   map.getProjectionObject()),
		avg)
		heat.addSource(source);
		
		// This still refers to the non-tructaed average
		if (data[i].avg > maxDelay) maxDelay = data[i].avg;
		if (data[i].avg < minDelay) minDelay = data[i].avg;
	    }

	    // Force the scale to stay the same, at the min and max.
	    heat.minval = SCALE_BOT;
	    heat.maxval = SCALE_TOP;

	    heat.setOpacity(0.65);
	    heat.pixelSize = 8;

	    // lastly, erase the old layer and add the new
	    if (oldLayer != null) {
		map.removeLayer(oldLayer);
	    }
	    map.addLayer(heat);

	    var mins = Math.floor(maxDelay/60);
	    var secs = Math.round(maxDelay - (mins*60));

	    minDelay = Math.abs(minDelay);
	    var minMins = Math.floor(minDelay/60);
	    var minSecs = Math.round(minDelay - (minMins*60));

	    
	    $('#maxDelay').text(mins + 'm ' + secs + 's');
	    $('#minDelay').text('-' + minMins + 'm ' + minSecs + 's');
	    $('#load').fadeOut();
	}
    });
}
	

$(document).ready(function () {
    $('#map').width($(window).width() - 180);
    $('#map').height($(window).height() - 60);

    map = new OpenLayers.Map("map", {projection: MAP_PROJ});
    var tileServers = 
	["http://otile1.mqcdn.com/tiles/1.0.0/osm/${z}/${x}/${y}.png",
         "http://otile2.mqcdn.com/tiles/1.0.0/osm/${z}/${x}/${y}.png",
         "http://otile3.mqcdn.com/tiles/1.0.0/osm/${z}/${x}/${y}.png",
         "http://otile4.mqcdn.com/tiles/1.0.0/osm/${z}/${x}/${y}.png"];
    var osm = new OpenLayers.Layer.OSM('MapQuest OSM', tileServers);
    
    // Add the MapQuest attribution
    osm.attribution += '<br/>Tiles courtesy of <a href="http://www.mapquest.com/" target="_blank">MapQuest</a> <img src="http://developer.mapquest.com/content/osm/mq_logo.png">';

    map.addLayer(osm);
    map.setBaseLayer(osm);

    map.setCenter(new OpenLayers.LonLat(-122.69110870364, 45.521493655281)
		  .transform(
		      new OpenLayers.Projection(DB_PROJ),
		      map.getProjectionObject()), 13);
    
    
    heat = null;
    drawHeatmap();

    setInterval(drawHeatmap, 30*1000);

});