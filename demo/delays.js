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
INTENSITY_MULTIPLIER = 1;

function drawHeatmap () {
    var oldLayer = heat;

    heat = new IDW.Layer();
    heat.colours = [0x00ff00ff, 0xff0000ff, 0x00ffff];

    var maxDelay = 0;

    // Yay! No XHR issues!
    $.ajax({
	method: 'GET',
	url: '/cgi-bin/delays.py',
	dataType: 'json',
	success: function (data) {
	    var dataLen = data.length;
	    for (var i = 0; i < dataLen; i++) {
		source = new IDW.Source(
		    new OpenLayers.LonLat(data[i].stop_lon,
					  data[i].stop_lat)
			.transform(new OpenLayers.Projection(DB_PROJ),
				   map.getProjectionObject()),
		data[i].avg * INTENSITY_MULTIPLIER)
		heat.addSource(source);
		
		if (data[i].avg > maxDelay) maxDelay = data[i].avg;
	    }

	    heat.setOpacity(0.65);
	    heat.pixelSize = 8;

	    // lastly, erase the old layer and add the new
	    if (oldLayer != null) {
		map.removeLayer(oldLayer);
	    }
	    map.addLayer(heat);

	    var mins = Math.floor(maxDelay/60);
	    var secs = Math.round(maxDelay - (mins*60));

	    $('#maxDelay').text(mins + 'm ' + secs + 's');
	}
    });
}
	

$(document).ready(function () {
    $('#map').width($(window).width() - 40);
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

    // in a few years, when 64x2.2GHz is common, we can turn this back on
    setInterval(drawHeatmap, 30*1000);

});