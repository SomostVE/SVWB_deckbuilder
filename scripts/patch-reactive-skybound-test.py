from pathlib import Path

path = Path("scripts/check-battle-reactive-events.mjs")
text = path.read_text()
old = '''player.personalTurn = 12;\nplayer.evolutionsThisMatch = 3;\nconst viraSuper = executeGenericEffects("[[battle-super-skybound-self:15]]", viraContext);\n'''
new = '''player.personalTurn = 12;\nplayer.evolutionsThisMatch = 0;\nviraContext.instance = { skyboundEvolutions: 3 };\nconst viraSuper = executeGenericEffects("[[battle-super-skybound-self:15]]", viraContext);\n'''
if text.count(old) != 1:
    raise SystemExit(f"expected one Vira Skybound regression block, found {text.count(old)}")
path.write_text(text.replace(old, new, 1))
