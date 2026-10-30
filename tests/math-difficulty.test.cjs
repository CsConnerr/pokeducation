const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');

const html = readFileSync(new URL('../index.html', `file://${__filename}`), 'utf8');
const script = html.match(/<script>'use strict';([\s\S]*?)<\/script>/)[1];
const shuffleSource = script.slice(script.indexOf('    function shuffle('), script.indexOf('    function nextPokemon('));
const questionSource = script.slice(script.indexOf('    function questionBounds('), script.indexOf('    function renderSprites('));

function generator(random) {
  const math = Object.create(Math);
  math.random = random;
  return vm.runInNewContext(`${shuffleSource}\n${questionSource}\nmakeQuestion`, { Math: math });
}

function seededRandom() {
  let seed = 123456789;
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

// Expected learning ranges for every position of the classroom slider.
const ranges = [
  [5, 2, 1], [10, 6, 2], [15, 12, 3], [20, 15, 4],
  [25, 19, 5], [30, 23, 6], [35, 27, 7], [40, 30, 8],
  [45, 34, 9], [50, 38, 10], [55, 42, 11], [60, 45, 12],
  [65, 49, 13], [70, 53, 14], [75, 57, 15], [80, 60, 16],
  [85, 64, 17], [90, 68, 18], [95, 72, 19], [100, 75, 20]
];

test('the complete game script parses', () => {
  assert.doesNotThrow(() => new vm.Script(script));
});

for (const operation of ['addition', 'multiplication']) {
  test(`${operation} respects every slider setting, including random extremes`, () => {
    const randomSources = [() => 0, () => 1 - Number.EPSILON, seededRandom()];
    for (const random of randomSources) {
      const makeQuestion = generator(random);
      for (const [limit, minimumTotal, minimumAddend] of ranges) {
        let previousTerms = '';
        for (let round = 0; round < 150; round++) {
          const q = makeQuestion(limit, previousTerms, operation);
          const terms = Array.from(q.terms);
          const key = terms.join(',');
          assert.equal(q.operation, operation);
          assert.notEqual(key, previousTerms);
          assert.ok(operation === 'addition' ? [2, 3].includes(terms.length) : terms.length === 2);
          assert.equal(q.total, operation === 'addition' ? terms.reduce((sum, n) => sum + n, 0) : terms[0] * terms[1]);
          assert.ok(q.total >= minimumTotal && q.total <= limit, `${operation} at ${limit}: ${key} = ${q.total}`);
          const minimumOperand = operation === 'addition' ? minimumAddend : (limit === 5 ? 1 : 2);
          assert.ok(terms.every(n => Number.isInteger(n) && n >= minimumOperand));
          if (operation === 'multiplication') assert.ok(terms.every(n => n <= 10));
          assert.equal(q.options.length, 4);
          assert.equal(new Set(q.options).size, 4);
          assert.ok(q.options.includes(q.total));
          assert.ok(q.options.every(n => Number.isInteger(n) && n >= 1 && n <= limit));
          previousTerms = key;
        }
      }
    }
  });

  test(`${operation} stays in range when the slider moves up and down`, () => {
    const makeQuestion = generator(seededRandom());
    let previousTerms = '';
    for (const [limit, minimumTotal] of [...ranges, ...ranges.slice().reverse(), ...ranges]) {
      const q = makeQuestion(limit, previousTerms, operation);
      assert.ok(q.total >= minimumTotal && q.total <= limit);
      previousTerms = q.terms.join(',');
    }
  });
}

test('addition randomly mixes two and three numbers at every slider position', () => {
  const makeQuestion = generator(seededRandom());
  for (const [limit] of ranges) {
    const counts = new Set();
    for (let round = 0; round < 100; round++) counts.add(makeQuestion(limit, '', 'addition').terms.length);
    assert.deepEqual([...counts].sort(), [2, 3]);
  }
});

test('addition mixes both question lengths without long streaks, even at random extremes', () => {
  for (const random of [() => 0, () => 1 - Number.EPSILON, seededRandom()]) {
    const makeQuestion = generator(random);
    for (const [limit, minimumTotal] of ranges) {
      const history = [];
      let previousTerms = '';
      for (let i = 0; i < 45; i++) {
        const q = makeQuestion(limit, previousTerms, 'addition', history.slice(-2));
        history.push(q.terms.length);
        assert.ok(q.total >= minimumTotal && q.total <= limit);
        if (history.length >= 3) {
          assert.deepEqual([...new Set(history.slice(-3))].sort(), [2, 3]);
        }
        previousTerms = q.terms.join(',');
      }
    }
  }
});

test('question lengths stay random and can repeat before the streak limit', () => {
  const makeQuestion = generator(seededRandom());
  const history = [];
  for (let i = 0; i < 40; i++) {
    history.push(makeQuestion(10, '', 'addition', history.slice(-2)).terms.length);
  }
  assert.ok(history.some((count, index) => index > 0 && count === history[index - 1]));
  assert.ok(history.some((count, index) => index > 0 && count !== history[index - 1]));
});

test('2 + 2 + 2 is possible at 10 and offers 6 as the correct answer', () => {
  const q = generator(() => 0)(10, '', 'addition');
  assert.deepEqual(Array.from(q.terms), [2, 2, 2]);
  assert.equal(q.total, 6);
  assert.ok(q.options.includes(6));
});

test('three numbers appear in both the question and the answered equation', () => {
  const renderSource = script.slice(script.indexOf('    function renderEquation('), script.indexOf('    function newQuestion('));
  const document = { createElement: () => ({ setAttribute() {} }) };
  const renderEquation = vm.runInNewContext(`${questionSource}\n${renderSource}\nrenderEquation`, { document });
  const container = {
    children: [],
    attributes: {},
    classList: { toggle() {} },
    replaceChildren() { this.children = []; },
    append(child) { this.children.push(child); },
    setAttribute(name, value) { this.attributes[name] = value; }
  };
  const question = { terms: [2, 2, 2], operation: 'addition', total: 6 };
  renderEquation(container, question);
  assert.equal(container.children.map(child => child.textContent).join(' '), '2 + 2 + 2 = ?');
  assert.equal(container.attributes['aria-label'], '2 plus 2 plus 2 equals how many?');
  renderEquation(container, question, true);
  assert.equal(container.children.map(child => child.textContent).join(' '), '2 + 2 + 2 = 6');
  assert.equal(container.attributes['aria-label'], '2 plus 2 plus 2 equals 6');
  renderEquation(container, { terms: [3, 4], operation: 'multiplication', total: 12 }, true);
  assert.equal(container.children.map(child => child.textContent).join(' '), '3 × 4 = 12');
});
