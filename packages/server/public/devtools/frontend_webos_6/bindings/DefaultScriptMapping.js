export default class DefaultScriptMapping{constructor(debuggerModel,workspace,debuggerWorkspaceBinding){this._debuggerModel=debuggerModel;this._debuggerWorkspaceBinding=debuggerWorkspaceBinding;this._project=new Bindings.ContentProviderBasedProject(workspace,'debugger:'+debuggerModel.target().id(),Workspace.projectTypes.Debugger,'',true);this._eventListeners=[debuggerModel.addEventListener(SDK.DebuggerModel.Events.GlobalObjectCleared,this._debuggerReset,this),debuggerModel.addEventListener(SDK.DebuggerModel.Events.ParsedScriptSource,this._parsedScriptSource,this),debuggerModel.addEventListener(SDK.DebuggerModel.Events.DiscardedAnonymousScriptSource,this._discardedScriptSource,this)];this._scriptSymbol=Symbol('symbol');}
static scriptForUISourceCode(uiSourceCode){const scripts=uiSourceCode[_scriptsSymbol];return scripts?scripts.values().next().value:null;}
rawLocationToUILocation(rawLocation){const script=rawLocation.script();if(!script){return null;}
const uiSourceCode=script[_uiSourceCodeSymbol];const lineNumber=rawLocation.lineNumber-(script.isInlineScriptWithSourceURL()?script.lineOffset:0);let columnNumber=rawLocation.columnNumber||0;if(script.isInlineScriptWithSourceURL()&&!lineNumber&&columnNumber){columnNumber-=script.columnOffset;}
return uiSourceCode.uiLocation(lineNumber,columnNumber);}
uiLocationToRawLocations(uiSourceCode,lineNumber,columnNumber){const script=uiSourceCode[this._scriptSymbol];if(!script){return[];}
if(script.isInlineScriptWithSourceURL()){return[this._debuggerModel.createRawLocation(script,lineNumber+script.lineOffset,lineNumber?columnNumber:columnNumber+script.columnOffset)];}
return[this._debuggerModel.createRawLocation(script,lineNumber,columnNumber)];}
_parsedScriptSource(event){const script=(event.data);const name=Common.ParsedURL.extractName(script.sourceURL);const url='debugger:///VM'+script.scriptId+(name?' '+name:'');const uiSourceCode=this._project.createUISourceCode(url,Common.resourceTypes.Script);uiSourceCode[this._scriptSymbol]=script;if(!uiSourceCode[_scriptsSymbol]){uiSourceCode[_scriptsSymbol]=new Set([script]);}else{uiSourceCode[_scriptsSymbol].add(script);}
script[_uiSourceCodeSymbol]=uiSourceCode;this._project.addUISourceCodeWithProvider(uiSourceCode,script,null,'text/javascript');this._debuggerWorkspaceBinding.updateLocations(script);}
_discardedScriptSource(event){const script=(event.data);const uiSourceCode=script[_uiSourceCodeSymbol];if(!uiSourceCode){return;}
delete script[_uiSourceCodeSymbol];delete uiSourceCode[this._scriptSymbol];uiSourceCode[_scriptsSymbol].delete(script);if(!uiSourceCode[_scriptsSymbol].size){delete uiSourceCode[_scriptsSymbol];}
this._project.removeUISourceCode(uiSourceCode.url());}
_debuggerReset(){this._project.reset();}
dispose(){Common.EventTarget.removeEventListeners(this._eventListeners);this._debuggerReset();this._project.dispose();}}
export const _scriptsSymbol=Symbol('symbol');export const _uiSourceCodeSymbol=Symbol('uiSourceCodeSymbol');self.Bindings=self.Bindings||{};Bindings=Bindings||{};Bindings.DefaultScriptMapping=DefaultScriptMapping;Bindings.DefaultScriptMapping._scriptsSymbol=_scriptsSymbol;Bindings.DefaultScriptMapping._uiSourceCodeSymbol=_uiSourceCodeSymbol;