/*
 * Based on, and a fork of, Bjoern Hoehrmann's OpenLayers Heatmap, copyright 
 * (c) 2010 Bjoern Hoehrmann <http://bjoern.hoehrmann.de/>.
 * This module is licensed under the same terms as OpenLayers itself.
 *
 */

 // START GUNK
 function appendErro(str){
   throw new Error("DEBUG: "+str)
}

function log(str){
   setTimeout("appendErro('"+str+"')", 1)
}
//END GUNK
 
 
IDW = {};

/**
 * Class: IDW.Source
 */
IDW.Source = OpenLayers.Class({

  /** 
   * APIProperty: lonlat
   * {OpenLayers.LonLat} location of the heat source
   */
  lonlat: null,

  /** 
   * APIProperty: val
   * {Number} Heat source value
   */
  val: null,

  /**
   * Constructor: IDW.Source
   * Create a heat source.
   *
   * Parameters:
   * lonlat - {OpenLayers.LonLat} Coordinates of the heat source
   * val - Data value
   */
  initialize: function(lonlat, val) {
    this.lonlat = lonlat;
    this.val = val;
  },

  CLASS_NAME: 'IDW.Source'
});

/**
 * Class: IDW.Layer
 * 
 * Inherits from:
 *  - <OpenLayers.Layer>
 */
IDW.Layer = OpenLayers.Class(OpenLayers.Layer, {

  /** 
   * APIProperty: isBaseLayer 
   * {Boolean} IDW layer is never a base layer.  
   */
  isBaseLayer: false,
  
  
  /** 
   * APIProperty: pixelSize 
   * {Integer} The number of pixels between each point for which IDW is calculated (the rest are interpolated).  Defaults to 16.
   */
  pixelSize: 16,

  /** 
   * APIProperty: maxNeighbours 
   * {Integer} The maximum number of neighbours to use in the calculation.  Defaults to 12.  Values < 1 are use all neighbours.
   */
  maxNeighbours: 12,
  
   /** 
   * APIProperty: colours 
   * {Integer} The stops in the colour ramp used to display the IDW.
   */
  colours: [0xff0000ff, 0x00ff00ff, 0x00ffff],
  
    /** 
   * APIProperty: power 
   * {Integer} The exponent of the distance decay power function. Defaults to 2.
   */
  power: 2,

  /** 
   * Property: points
   * {Array(<IDW.Source>)} internal coordinate list
   */
  points: null,

  /** 
   * Property: canvas
   * {DOMElement} Canvas element.
   */
  canvas: null,

  /**
   * Constructor: IDW.Layer
   * Create a IDW layer.
   *
   * Parameters:
   * name - {String} Name of the Layer
   * options - {Object} Hashtable of extra options to tag onto the layer
   */
  initialize: function(name, options) {
    OpenLayers.Layer.prototype.initialize.apply(this, arguments);
    this.points = [];
	this.minval = Infinity;
	this.maxval = -Infinity;
    this.canvas = document.createElement('canvas');
    this.canvas.style.position = 'absolute';

    // For some reason OpenLayers.Layer.setOpacity assumes there is
    // an additional div between the layer's div and its contents.
    var sub = document.createElement('div');
    sub.appendChild(this.canvas);
    this.div.appendChild(sub);
  },

  /**
   * APIMethod: addSource
   * Adds a heat source to the layer.
   *
   * Parameters:
   * source - {<IDW.Source>} 
   */
  addSource: function(source) {
	if (source.val < this.minval) this.minval = source.val
	if (source.val > this.maxval) this.maxval = source.val
    this.points.push(source);
  },

  /**
   * APIMethod: removeSource
   * Removes a heat source from the layer.
   * 
   * Parameters:
   * source - {<IDW.Source>} 
   */
  removeSource: function(source) {
    if (this.points && this.points.length) {
      OpenLayers.Util.removeItem(this.points, source);
    }
  },

  /** 
   * Method: moveTo
   *
   * Parameters:
   * bounds - {<OpenLayers.Bounds>} 
   * zoomChanged - {Boolean} 
   * dragging - {Boolean} 
   */
  moveTo: function(bounds, zoomChanged, dragging) {

    OpenLayers.Layer.prototype.moveTo.apply(this, arguments);

    // The code is too slow to update the rendering during dragging.
    if (dragging)
      return;

    // Pick some point on the map and use it to determine the offset
    // between the viewports's 0,0 coordinate and the layer's 0,0 position.
    var someLoc = new OpenLayers.LonLat(0,0);
    var offsetX = this.map.getViewPortPxFromLonLat(someLoc).x -
                  this.map.getLayerPxFromLonLat(someLoc).x;
    var offsetY = this.map.getViewPortPxFromLonLat(someLoc).y -
                  this.map.getLayerPxFromLonLat(someLoc).y;
    this.canvas.width = this.map.getSize().w;
    this.canvas.height = this.map.getSize().h;

    var ctx = this.canvas.getContext('2d');

    ctx.save(); // Workaround for a bug in Google Chrome
    ctx.fillStyle = 'transparent';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.restore();
	
	//calculate the inverse distance weighting
	var start = +new Date();
	var iii = 0;
	var sizex = ((this.canvas.width / this.pixelSize) >> 0) + 2;
	var sizey = ((this.canvas.height / this.pixelSize) >> 0) + 2;
	var matrix = new Array(sizex);
	var val_range = this.maxval - this.minval; //rescale to 0.0 - 1.0
      
      // calculate this beforehand, so it isn't calculated on each iteration
      var pointsLen = this.points.length;
      for (var i = 0; i < pointsLen; i++) {
	  this.points[i].destpos = 
	      this.map.getViewPortPxFromLonLat(this.points[i].lonlat);
      }

	for (var x = 0; x < sizex; x++){
		matrix[x] = new Array(sizey);
		for (var y = 0; y < sizey; y++){		
			iii++;
			var dists = [];
		    var sum_dist = 0;
		    

			// calculate, record and sum the (decayed) distances
			for (var i in this.points){
				var dest = this.points[i];
				var eucdist = Math.pow(x * this.pixelSize - dest.destpos.x, 2) + 
					Math.pow(y * this.pixelSize - dest.destpos.y, 2);
				var dist_decayed = Math.pow(eucdist, -this.power);
				sum_dist += dist_decayed;
				dists.push({dist: dist_decayed, val: dest.val});
			}
			// calculate the inverse distance weight
			matrix[x][y] = 0;
			for (var i = 0, len = dists.length; i < len; i++){
				matrix[x][y] += dists[i].val * dists[i].dist / sum_dist
			}
			matrix[x][y] = (matrix[x][y] - this.minval) / val_range;
		}
	}
	var end =  +new Date();
	var diff = end - start;
	log("IDW calculation: " + iii + " iterations, " + (diff / 1000) + " seconds.")
	//write to the canvas, resampling and choosing the appropriate colour
	start = +new Date();
	var dat = ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
    var pix = dat.data;
	var minx, dx, miny, dy;//bilinear
	// isolate rgba components of colour for interpolating the colour ramp
	var cols = [];
	for (var i = 0; i < this.colours.length; i++){
		cols[i] = [(this.colours[i] >> 24) & 0xFF, 
				   (this.colours[i] >> 16) & 0xFF,
				   (this.colours[i] >> 8)  & 0xFF,
				   (this.colours[i] >> 0)  & 0xFF]
	}
	for (var x = 0; x < this.canvas.width; x ++){		
		minx = (x / this.pixelSize) >> 0; //bilinear
		dx = (x / this.pixelSize) - minx; //bilinear
		for (var y = 0; y < this.canvas.height; y ++){		
			if (this.pixelSize > 1){
				//If pixelSize > 1 we need to resample our IDX grid to match the canvas size
				//NEAREST NEIGHBOUR (blocky and awful)
				//var pixel_val = matrix[Math.round(x / this.pixelSize)][Math.round(y / this.pixelSize)]
				//BILINEAR (moderately blockly but tolerable)
				miny = ((y / this.pixelSize) >> 0);
				dy = (y / this.pixelSize) - miny;
				var pixel_val = (matrix[minx][miny] * (2 - dx - dy) +
								 matrix[minx][miny + 1] * (1 - dx + dy) +
								 matrix[minx + 1][miny] * (dx + 1 - dy) +
								 matrix[minx + 1][miny + 1] * (dx + dy))
								 / 4;
			} else {
				var pixel_val = matrix[x][y];
			}
			var idx = (this.canvas.width * y + x) * 4;
			// Rescale to fit into colour ramp
			var colRamp = (cols.length - 1) * pixel_val;
			var colFloor = colRamp >> 0;
			minCol = cols[colFloor];
			maxCol = cols[colFloor + 1];
			pixel_val = colRamp - colFloor;
			var inv_val = 1 - pixel_val;
			pix[idx  ] = minCol[0] * inv_val + maxCol[0] * pixel_val; //red
			pix[idx+1] = minCol[1] * inv_val + maxCol[1] * pixel_val; //green
			pix[idx+2] = minCol[2] * inv_val + maxCol[2] * pixel_val; //blue
			pix[idx+3] = minCol[3] * inv_val + maxCol[3] * pixel_val; //alpha
		}
	}
	//save the image	
    ctx.putImageData(dat, 0, 0);
	end =  +new Date();
	diff = end - start;
	log("Resampling and writing to canvas: " + (diff / 1000) + " seconds.")

	
    // Unfortunately OpenLayers does not currently support layers that
    // remain in a fixed position with respect to the screen location
    // of the base layer, so this puts this layer manually back into
    // that position using one point's offset as determined earlier.
    this.canvas.style.left = (-offsetX) + 'px';
    this.canvas.style.top = (-offsetY) + 'px';
  },

  /** 
   * APIMethod: getDataExtent
   * Calculates the max extent which includes all of the heat sources.
   * 
   * Returns:
   * {<OpenLayers.Bounds>}
   */
  getDataExtent: function () {
    var maxExtent = null;
        
    if (this.points && (this.points.length > 0)) {
      var maxExtent = new OpenLayers.Bounds();
      for(var i = 0, len = this.points.length; i < len; ++i) {
        var point = this.points[i];
        maxExtent.extend(point.lonlat);
      }
    }
    return maxExtent;
  },

  CLASS_NAME: 'IDW.Layer'

});
