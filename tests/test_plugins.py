import unittest
from studio_plugins import validate_plugin
class PluginTests(unittest.TestCase):
 def test_pack(self):
  import json
  from pathlib import Path
  from studio_server import validate_project,validate_effects
  pack=json.loads(Path('examples/motion-pack.json').read_text(encoding='utf-8'))
  result=validate_plugin(pack,validate_project,validate_effects)
  self.assertEqual(len(result['materials']),2)
  self.assertEqual(len(result['effects']),1)
  pack['materials'][0]['template']['scale']=-5
  with self.assertRaises(ValueError):validate_plugin(pack,validate_project,validate_effects)
 def test_reject_script(self):
  from studio_server import validate_project,validate_effects
  with self.assertRaises(ValueError):validate_plugin({'version':2,'name':'x','materials':[{'name':'x','template':{'script':'alert(1)'}}]},validate_project,validate_effects)
