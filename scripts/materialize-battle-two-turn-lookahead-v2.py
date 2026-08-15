from pathlib import Path

source_path = Path('scripts/materialize-battle-two-turn-lookahead.py')
source = source_path.read_text(encoding='utf-8')

wrong = '''old_sig = \'\'\'export function inspectTurnPlan({\\n  hand = [], board = [], opponentBoard = [], opponentHand = [], opponentDeck = [], pp = 0, maxPp = pp, hp = 20, opponentHp = 20,\\n  personalTurn = 5, goingFirst = true, goingSecond = false, ep = 2, sep = 2,\\n  opponentPersonalTurn = 0, opponentMaxPp = 0, opponentEp = 2, opponentSep = 2,\\n  strategy = {}, opponentStrategy = {}, depth = 4, beamWidth = 4, future = false, futureSamples = 2\\n} = {}) {\\n  const allCards = [...hand, ...opponentHand, ...opponentDeck, ...board.map(value => value.card).filter(Boolean), ...opponentBoard.map(value => value.card).filter(Boolean)];\'\'\''''
correct = '''old_sig = \'\'\'export function inspectTurnPlan({\\n  hand = [], board = [], opponentBoard = [], pp = 0, maxPp = pp, hp = 20, opponentHp = 20,\\n  personalTurn = 5, goingFirst = true, goingSecond = false, ep = 2, sep = 2,\\n  strategy = {}, depth = 4, beamWidth = 4\\n} = {}) {\\n  const allCards = [...hand, ...board.map(value => value.card).filter(Boolean), ...opponentBoard.map(value => value.card).filter(Boolean)];\'\'\''''

if wrong not in source:
    raise SystemExit('two-turn materializer bridge anchor missing')
source = source.replace(wrong, correct, 1)
exec(compile(source, str(source_path), 'exec'))
