/*
 * LEGACY (ES5) rating engine, intentionally kept in its original style.
 *
 * It models the kind of pre-ES6 integration found in long-lived insurance platforms:
 *   - IIFE + prototype constructor, `var`, no arrow functions, no modules, no `Number.isFinite`
 *   - numeric inputs frequently arrive as strings (from XML/CSV feeds)
 *   - failures are signalled by THROWING STRINGS, not Error objects (no stack traces!)
 * The TypeScript adapter (legacy-rating-adapter.ts) isolates these quirks behind a typed, Error-based API
 * and a parity test proves the legacy output stays equal to the modern domain model.
 */
(function (root) {
  'use strict';

  var HAZARD_CAP = 45;
  var LOSS_CAP = 40;
  var DED_CAP = 15;

  function toNumber(value, label) {
    var n = typeof value === 'string' ? parseFloat(value.replace(/,/g, '')) : value;
    if (typeof n !== 'number' || n !== n || n === Infinity || n === -Infinity) {
      throw 'LEGACY_BAD_NUMBER:' + label; // throws a STRING on purpose
    }
    return n;
  }

  function LegacyRatingEngine(options) {
    if (!(this instanceof LegacyRatingEngine)) {
      return new LegacyRatingEngine(options); // allows calling without `new`
    }
    this.options = options || {};
    this.calls = 0;
  }

  LegacyRatingEngine.prototype.score = function (policy) {
    var hazard = toNumber(policy.hazard, 'hazard');
    var lossRatio = toNumber(policy.lossRatio, 'lossRatio');
    var tiv = toNumber(policy.tiv, 'tiv');
    var deductible = toNumber(policy.deductible, 'deductible');
    if (tiv <= 0) {
      throw 'LEGACY_NON_POSITIVE_TIV';
    }
    var deductibleRatio = deductible / tiv;
    var hazardPart = Math.min(HAZARD_CAP, hazard * 15);
    var lossPart = Math.min(LOSS_CAP, lossRatio * 40);
    var dedPart = Math.max(0, DED_CAP - deductibleRatio * 1500);
    var total = hazardPart + lossPart + dedPart;
    this.calls++;
    return Math.round(Math.min(100, Math.max(0, total)));
  };

  LegacyRatingEngine.prototype.grade = function (score) {
    if (score < 25) return 'A';
    if (score < 45) return 'B';
    if (score < 65) return 'C';
    if (score < 82) return 'D';
    return 'E';
  };

  root.LegacyRatingEngine = LegacyRatingEngine;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = LegacyRatingEngine;
  }
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this);
