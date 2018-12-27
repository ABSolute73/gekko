// internally we only use 1m
// candles, this can easily
// convert them to any desired
// size.

// Acts as ~fake~ stream: takes
// 1m candles as input and emits
// bigger candles.
// 
// input are transported candles.

var _ = require('lodash');
var util = require(__dirname + '/util');

var CandleBatcher = function(candleSize) {
  if(!_.isNumber(candleSize))
    throw new Error('candleSize is not a number');

  this.candleSize = candleSize;
  this.smallCandles = [];
  this.calculatedCandles = [];

  _.bindAll(this);
}

util.makeEventEmitter(CandleBatcher);

CandleBatcher.prototype.emit1M = async function(candle) {
  if (this.asynchandler1M !== undefined) await this.asynchandler1M(candle);
}


CandleBatcher.prototype.write = async function(candles) {
  if(!_.isArray(candles)) {
    throw new Error('candles is not an array');
  }

  this.emitted = 0;

  _.each(candles, function(candle) {
    this.smallCandles.push(candle);
    this.check();
  }, this);

  return this.emitted;
}

CandleBatcher.prototype.check = async function() {
  if (this.smallCandles.length > 0) {
    await this.emit1M(this.smallCandles[this.smallCandles.length-1]);
  }

  if(_.size(this.smallCandles) % this.candleSize !== 0)
    return;

  this.emitted++;
  this.calculatedCandles.push(this.calculate());
  this.smallCandles = [];
}

CandleBatcher.prototype.reg1MAsyncHandler = function(handler) {
  this.asynchandler1M = handler;
}

CandleBatcher.prototype.regAsyncHandler = function(handler) {
   this.asynchandler = handler;
}

CandleBatcher.prototype.flush = async function() {
  _.each(
    this.calculatedCandles,
    async (candle) => {
      this.emit('candle', candle);
      
      if (this.asynchandler !== undefined)
        await this.asynchandler(candle);
    }
  );

  this.calculatedCandles = [];
}

CandleBatcher.prototype.calculate = function() {
  // remove the id property of the small candle
  var { id, ...first } = this.smallCandles.shift();

  first.vwp = first.vwp * first.volume;

  var candle = _.reduce(
    this.smallCandles,
    function(candle, m) {
      candle.high = _.max([candle.high, m.high]);
      candle.low = _.min([candle.low, m.low]);
      candle.close = m.close;
      candle.volume += m.volume;
      candle.vwp += m.vwp * m.volume;
      candle.trades += m.trades;
      candle.end = m.start;
      return candle;
    },
    first
  );

  if(candle.volume)
    // we have added up all prices (relative to volume)
    // now divide by volume to get the Volume Weighted Price
    candle.vwp /= candle.volume;
  else
    // empty candle
    candle.vwp = candle.open;

  candle.start = first.start;
  return candle;
}

module.exports = CandleBatcher;
