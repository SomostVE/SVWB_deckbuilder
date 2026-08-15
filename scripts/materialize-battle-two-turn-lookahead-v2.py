from pathlib import Path

source_path = Path('scripts/materialize-battle-two-turn-lookahead.py')
source = source_path.read_text(encoding='utf-8')

wrong = '''old_sig = \'\'\'export function inspectTurnPlan({\\n  hand = [], board = [], opponentBoard = [], opponentHand = [], opponentDeck = [], pp = 0, maxPp = pp, hp = 20, opponentHp = 20,\\n  personalTurn = 5, goingFirst = true, goingSecond = false, ep = 2, sep = 2,\\n  opponentPersonalTurn = 0, opponentMaxPp = 0, opponentEp = 2, opponentSep = 2,\\n  strategy = {}, opponentStrategy = {}, depth = 4, beamWidth = 4, future = false, futureSamples = 2\\n} = {}) {\\n  const allCards = [...hand, ...opponentHand, ...opponentDeck, ...board.map(value => value.card).filter(Boolean), ...opponentBoard.map(value => value.card).filter(Boolean)];\'\'\''''
correct = '''old_sig = \'\'\'export function inspectTurnPlan({\\n  hand = [], board = [], opponentBoard = [], pp = 0, maxPp = pp, hp = 20, opponentHp = 20,\\n  personalTurn = 5, goingFirst = true, goingSecond = false, ep = 2, sep = 2,\\n  strategy = {}, depth = 4, beamWidth = 4\\n} = {}) {\\n  const allCards = [...hand, ...board.map(value => value.card).filter(Boolean), ...opponentBoard.map(value => value.card).filter(Boolean)];\'\'\''''

if wrong not in source:
    raise SystemExit('two-turn materializer signature bridge anchor missing')
source = source.replace(wrong, correct, 1)

setup_start = source.find("old_setup = '''  player.hand = hand.map(card => instance(player, card));")
setup_end = source.find("path.write_text(text, encoding='utf-8')", setup_start)
if setup_start < 0 or setup_end < 0:
    raise SystemExit('two-turn materializer setup bridge anchor missing')

setup_patch = r"""repl(
'''  const opponent = makePlayer("Opponent", [], {}, map, rng);''',
'''  const opponent = makePlayer("Opponent", [], opponentStrategy, map, rng);''',
'QA opponent strategy')

old_setup = '''  opponent.hp = Number(opponentHp) || 0;\n\n  player.hand = hand.map(card => instance(player, card));'''
new_setup = '''  opponent.hp = Number(opponentHp) || 0;\n  opponent.goingFirst = !player.goingFirst;\n  opponent.goingSecond = !player.goingSecond;\n  opponent.personalTurn = Math.max(0, Number(opponentPersonalTurn) || 0);\n  opponent.maxPp = Math.max(0, Number(opponentMaxPp) || 0);\n  opponent.pp = opponent.maxPp;\n  opponent.ep = Math.max(0, Number(opponentEp) || 0);\n  opponent.sep = Math.max(0, Number(opponentSep) || 0);\n\n  player.hand = hand.map(card => instance(player, card));\n  player.deck = deck.map(card => instance(player, card));\n  opponent.hand = opponentHand.map(card => instance(opponent, card));\n  opponent.deck = opponentDeck.map(card => instance(opponent, card));'''
repl(old_setup, new_setup, 'QA future hidden zones and own deck')

"""
source = source[:setup_start] + setup_patch + source[setup_end:]
exec(compile(source, str(source_path), 'exec'))
