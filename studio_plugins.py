"""Declarative extension packs, validated with the project schema."""
import copy

def validate_plugin(body, validate_project, validate_effects):
    if not isinstance(body,dict) or body.get('version') not in (1,2) or not isinstance(body.get('name'),str) or not 1<=len(body['name'])<=80:
        raise ValueError('プラグイン名と version: 1 または 2 が必要です。')
    pack={'version':body['version'],'name':body['name'],'description':str(body.get('description','ユーザープラグイン'))[:160]}
    if body['version']==1:
        validate_effects(body.get('effects'));pack['effects']=body['effects'];return pack
    materials=body.get('materials',[]);effects=body.get('effects',[])
    if not isinstance(materials,list) or not isinstance(effects,list) or not 1<=len(materials)+len(effects)<=64:
        raise ValueError('素材・効果は合計1〜64件です。')
    pack.update(materials=[],effects=[])
    for kind,entries in [('materials',materials),('effects',effects)]:
        for entry in entries:
            if not isinstance(entry,dict) or not isinstance(entry.get('name'),str) or not 1<=len(entry['name'])<=80:
                raise ValueError('追加素材・効果の名前が必要です。')
            base={'id':'template','asset':None,'kind':'shape','start':0,'duration':5,'sourceIn':0,'track':0,'x':0,'y':0,'z':0,'scale':100,'rotation':0,'opacity':100,'volume':100,'effects':{},'color':'#b0efcf','text':'テキスト'}
            fields={'kind','duration','x','y','z','scale','rotation','opacity','color','width','height','shape','text','fontSize','align','keys','shader','effects','eq'} if kind=='materials' else {'effects','shader','keys','eq'}
            values=entry.get('template' if kind=='materials' else 'values')
            if not isinstance(values,dict) or set(values)-fields:raise ValueError('プラグインの設定項目が不正です。')
            base.update(copy.deepcopy(values))
            if base['kind'] not in ('shape','text','camera','mask'):raise ValueError('追加素材の種類が不正です。')
            validate_project({'version':2,'name':'validation','trackCount':6,'clips':[base]})
            pack[kind].append({'name':entry['name'],'description':str(entry.get('description',''))[:160], 'template' if kind=='materials' else 'values':copy.deepcopy(values)})
    return pack
