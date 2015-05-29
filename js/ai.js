function AI(grid) {
  this.grid = grid;
}

AI.prototype.getBest = function() {
  var move = this.getBestDirection();
  var alternativeMoves = convnetjs.randperm(4);
  alternativeMoves.unshift(move);
  var possibleMove = this.grid.firstPossibleMove(alternativeMoves);
  //console.log(alternativeMoves);
  //console.log(possibleMove);
  return { move: possibleMove };
}

AI.prototype.getBestDirection = function() {
  throw Error("AI should implement getBest() or getBestDirection()");
}

AI.prototype.learnMove = function(grid, move) {
  throw Error("This AI does not support learnMove() and so cannot not be a learner");
}

function AlphaBetaAI(grid) {
  AI.call(this, grid);
}

AlphaBetaAI.prototype = Object.create(AI.prototype);
AlphaBetaAI.prototype.constructor = AlphaBetaAI;

// static evaluation function
AlphaBetaAI.prototype.eval = function() {
  var emptyCells = this.grid.availableCells().length;

  var smoothWeight = 0.1,
      //monoWeight   = 0.0,
      //islandWeight = 0.0,
      mono2Weight  = 1.0,
      emptyWeight  = 2.7,
      maxWeight    = 1.0;

  return this.grid.smoothness() * smoothWeight
       //+ this.grid.monotonicity() * monoWeight
       //- this.grid.islands() * islandWeight
       + this.grid.monotonicity2() * mono2Weight
       + Math.log(emptyCells) * emptyWeight
       + this.grid.maxValue() * maxWeight;
};

// alpha-beta depth first search
AlphaBetaAI.prototype.search = function(depth, alpha, beta, positions, cutoffs) {
  var bestScore;
  var bestMove = -1;
  var result;

  // the maxing player
  if (this.grid.playerTurn) {
    bestScore = alpha;
    for (var direction in [0, 1, 2, 3]) {
      var newGrid = this.grid.clone();
      if (newGrid.move(direction).moved) {
        positions++;
        if (newGrid.isWin()) {
          return { move: direction, score: 10000, positions: positions, cutoffs: cutoffs };
        }
        var newAlphaBetaAI = new AlphaBetaAI(newGrid);

        if (depth == 0) {
          result = { move: direction, score: newAlphaBetaAI.eval() };
        } else {
          result = newAlphaBetaAI.search(depth-1, bestScore, beta, positions, cutoffs);
          if (result.score > 9900) { // win
            result.score--; // to slightly penalize higher depth from win
          }
          positions = result.positions;
          cutoffs = result.cutoffs;
        }

        if (result.score > bestScore) {
          bestScore = result.score;
          bestMove = direction;
        }
        if (bestScore > beta) {
          cutoffs++
          return { move: bestMove, score: beta, positions: positions, cutoffs: cutoffs };
        }
      }
    }
  }

  else { // computer's turn, we'll do heavy pruning to keep the branching factor low
    bestScore = beta;

    // try a 2 and 4 in each cell and measure how annoying it is
    // with metrics from eval
    var candidates = [];
    var cells = this.grid.availableCells();
    var scores = { 2: [], 4: [] };
    for (var value in scores) {
      for (var i in cells) {
        scores[value].push(null);
        var cell = cells[i];
        var tile = new Tile(cell, parseInt(value, 10));
        this.grid.insertTile(tile);
        scores[value][i] = -this.grid.smoothness() + this.grid.islands();
        this.grid.removeTile(cell);
      }
    }

    // now just pick out the most annoying moves
    var maxScore = Math.max(Math.max.apply(null, scores[2]), Math.max.apply(null, scores[4]));
    for (var value in scores) { // 2 and 4
      for (var i=0; i<scores[value].length; i++) {
        if (scores[value][i] == maxScore) {
          candidates.push( { position: cells[i], value: parseInt(value, 10) } );
        }
      }
    }

    // search on each candidate
    for (var i=0; i<candidates.length; i++) {
      var position = candidates[i].position;
      var value = candidates[i].value;
      var newGrid = this.grid.clone();
      var tile = new Tile(position, value);
      newGrid.insertTile(tile);
      newGrid.playerTurn = true;
      positions++;
      newAlphaBetaAI = new AlphaBetaAI(newGrid);
      result = newAlphaBetaAI.search(depth, alpha, bestScore, positions, cutoffs);
      positions = result.positions;
      cutoffs = result.cutoffs;

      if (result.score < bestScore) {
        bestScore = result.score;
      }
      if (bestScore < alpha) {
        cutoffs++;
        return { move: null, score: alpha, positions: positions, cutoffs: cutoffs };
      }
    }
  }

  return { move: bestMove, score: bestScore, positions: positions, cutoffs: cutoffs };
}

// performs a search and returns the best move
AlphaBetaAI.prototype.getBest = function() {
  return this.iterativeDeep();
}

// performs iterative deepening over the alpha-beta search
AlphaBetaAI.prototype.iterativeDeep = function() {
  var start = (new Date()).getTime();
  var depth = 0;
  var best;
  do {
    var newBest = this.search(depth, -10000, 10000, 0 ,0);
    if (newBest.move == -1) {
      break;
    } else {
      best = newBest;
    }
    depth++;
  } while ( (new Date()).getTime() - start < minSearchTime);
  return best
}

function UpRightDownRightAI(grid) {
  AI.call(this, grid);
  this.phase = 0;
}

UpRightDownRightAI.prototype = Object.create(AI.prototype);
UpRightDownRightAI.prototype.constructor = UpRightDownRightAI;

UpRightDownRightAI.prototype.getBestDirection = function () {
  var  moves = [ [0,1,2,3],
                 [1,2,0,3],
                 [2,1,0,3],
                 [1,0,2,3] ];
  //console.log(this.phase);
  var direction = this.grid.firstPossibleMove(moves[this.phase]);
  //if (direction == moves[this.phase][0])
    this.phase = (this.phase + 1) % 4;

  return direction;
}

function MagicNetAI(grid) {
  AI.call(this, grid);
  this.learning = true;
  this.labels = [];
  this.data = [];
}

MagicNetAI.prototype = Object.create(AI.prototype);
MagicNetAI.prototype.constructor = MagicNetAI;

MagicNetAI.prototype.learnMove = function(grid, move) {
  if (!this.learning)
    console.log("This MagicNetAI is not accepting new data but learnMove() called");
  this.data.push(new convnetjs.Vol(grid.cellsLog2Vector()));
  this.labels.push(move.move);
}

MagicNetAI.prototype.getBestDirection = function() {
  if (this.learning) {
    this.learning = false;
    this.net = new convnetjs.MagicNet(this.data, this.labels);
    var trainSteps = 100;
    for (var i = 0; i < trainSteps; i++)
      this.net.step();
  }

  return this.net.predict(new convnetjs.Vol(this.grid.cellsLog2Vector()));
}

