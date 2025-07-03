import { SupportedLanguage } from '@/core/domain/parsing/types/supported-languages';
import { TestCaseData } from '.';
import { RepositoryData } from '@kodus/kodus-proto/ast/v2';

type MockData = {
    [key in SupportedLanguage]: TestCaseData[];
};

const orchestrator: RepositoryData = {
    organizationId: '35c117e3-f4de-42f0-be5a-f95286f61fdb',
    repositoryId: '670345891',
    repositoryName: 'kodus-orchestrator',
    branch: 'feat-astv3',
} as RepositoryData;

const testingRepo: RepositoryData = {
    organizationId: '35c117e3-f4de-42f0-be5a-f95286f61fdb',
    repositoryId: '929108425',
    repositoryName: 'testing-repo',
    branch: 'typescript-diff',
} as RepositoryData;

export const mockData: Partial<MockData> = {
    typescript: [
        {
            repoData: testingRepo,
            filePath:
                '/tmp/cloned-repos/35c117e3-f4de-42f0-be5a-f95286f61fdb/repositories/929108425:testing-repo/typescript-diff/src/simple/1/b.ts',
            diff: `
diff --git a/src/simple/1/a.ts b/src/simple/1/b.ts
index 66afa60..aa68d46 100644
--- a/src/simple/1/a.ts
+++ b/src/simple/1/b.ts
@@ -9,6 +9,7 @@ class Foo {
     }

     foo() {
+        console.log("foo called");
         console.log("Hello, world!");
     }

@@ -19,5 +20,6 @@ class Foo {
     bar() {
         this.foo();
         console.log("Goodbye, world!");
+        console.log("bar called");
     }
 }
`,
            expected: `<-- /tmp/cloned-repos/35c117e3-f4de-42f0-be5a-f95286f61fdb/repositories/929108425:testing-repo/typescript-diff/src/simple/1/b.ts -->
1: class Foo {
2:     private _privateProperty: string;
3:
4:     constructor(
5:         privateProperty: string,
6:         private readonly anotherProperty?: string
7:     ) {
8:         this._privateProperty = privateProperty;
9:     }
10:
11:     foo() {
12:         console.log("foo called");
13:         console.log("Hello, world!");
14:     }

<- CUT CONTENT ->

20:     bar() {
21:         this.foo();
22:         console.log("Goodbye, world!");
23:         console.log("bar called");
24:     }
25: }`,
        },
        {
            repoData: testingRepo,
            filePath:
                '/tmp/cloned-repos/35c117e3-f4de-42f0-be5a-f95286f61fdb/repositories/929108425:testing-repo/typescript-diff/src/simple/2/b.ts',
            diff: `
diff --git a/src/simple/2/a.ts b/src/simple/2/b.ts
index 1b5b18e..a169704 100644
--- a/src/simple/2/a.ts
+++ b/src/simple/2/b.ts
@@ -20,4 +20,5 @@ class Foo {

 function baz() {
     console.log("baz called");
+    console.log("baz baz baz");
 }
`,
            expected: `<-- /tmp/cloned-repos/35c117e3-f4de-42f0-be5a-f95286f61fdb/repositories/929108425:testing-repo/typescript-diff/src/simple/2/b.ts -->

<- CUT CONTENT ->

21: function baz() {
22:     console.log("baz called");
23:     console.log("baz baz baz");
24: }`,
        },
        {
            repoData: testingRepo,
            filePath:
                '/tmp/cloned-repos/35c117e3-f4de-42f0-be5a-f95286f61fdb/repositories/929108425:testing-repo/typescript-diff/src/simple/3/b.ts',
            diff: `
diff --git a/src/simple/3/a.ts b/src/simple/3/b.ts
index dff5b41..01f021b 100644
--- a/src/simple/3/a.ts
+++ b/src/simple/3/b.ts
@@ -28,4 +28,5 @@ function baz() {
     foo.foo();

     console.log("baz called");
+    console.log("baz baz baz");
 }
`,
            expected: `<-- /tmp/cloned-repos/35c117e3-f4de-42f0-be5a-f95286f61fdb/repositories/929108425:testing-repo/typescript-diff/src/simple/3/b.ts -->

<- CUT CONTENT ->

25: function baz() {
26:     const foo = new Foo("privateValue", "anotherValue");
27:
28:     foo.foo();
29:
30:     console.log("baz called");
31:     console.log("baz baz baz");
32: }`,
        },
        {
            repoData: testingRepo,
            filePath:
                '/tmp/cloned-repos/35c117e3-f4de-42f0-be5a-f95286f61fdb/repositories/929108425:testing-repo/typescript-diff/src/simple/4/b.ts',
            diff: `
diff --git a/src/simple/4/a.ts b/src/simple/4/b.ts
index dff5b41..85926cf 100644
--- a/src/simple/4/a.ts
+++ b/src/simple/4/b.ts
@@ -9,6 +9,7 @@ class Foo {
     }

     foo() {
+        console.log("foo called");
         console.log("Hello, world!");
     }
 `,
            expected: `<-- /tmp/cloned-repos/35c117e3-f4de-42f0-be5a-f95286f61fdb/repositories/929108425:testing-repo/typescript-diff/src/simple/4/b.ts -->
1: class Foo {
2:     private _privateProperty: string;
3:
4:     constructor(
5:         privateProperty: string,
6:         private readonly anotherProperty?: string
7:     ) {
8:         this._privateProperty = privateProperty;
9:     }
10:
11:     foo() {
12:         console.log("foo called");
13:         console.log("Hello, world!");
14:     }
15:
16:     bar() {
17:         this.foo();
18:         console.log("Goodbye, world!");
19:     }

<- CUT CONTENT ->

24: }

<- CUT CONTENT ->

26: function baz() {
27:     const foo = new Foo("privateValue", "anotherValue");
28:
29:     foo.foo();
30:
31:     console.log("baz called");
32: }`,
        },
        {
            repoData: testingRepo,
            filePath:
                '/tmp/cloned-repos/35c117e3-f4de-42f0-be5a-f95286f61fdb/repositories/929108425:testing-repo/typescript-diff/src/related/1/b.ts',
            diff: `
diff --git a/src/related/1/a.ts b/src/related/1/b.ts
index b68b68e..0b34d51 100644
--- a/src/related/1/a.ts
+++ b/src/related/1/b.ts
@@ -28,4 +28,5 @@ export function baz() {
     cl.foo();

     console.log("baz called");
+    console.log("baz called from b.ts");
 }
`,
            expected: `<-- /tmp/cloned-repos/35c117e3-f4de-42f0-be5a-f95286f61fdb/repositories/929108425:testing-repo/typescript-diff/src/related/1/foo/foo.ts -->

<- CUT CONTENT ->

3: function main() {
4:     const foo = baz();
5:     console.log("baz called from b.ts");
6: }

<-- /tmp/cloned-repos/35c117e3-f4de-42f0-be5a-f95286f61fdb/repositories/929108425:testing-repo/typescript-diff/src/related/1/b.ts -->

<- CUT CONTENT ->

25: function baz() {
26:     const cl = new Foo("privateValue", "anotherValue");
27:
28:     cl.foo();
29:
30:     console.log("baz called");
31:     console.log("baz called from b.ts");
32: }`,
        },
        {
            repoData: orchestrator,
            filePath:
                '/tmp/cloned-repos/35c117e3-f4de-42f0-be5a-f95286f61fdb/repositories/670345891:kodus-orchestrator/feat-astv3/src/ee/codeBase/codeAnalysisOrchestrator.service.ts',
            diff: `
diff --git a/src/ee/codeBase/codeAnalysisOrchestrator.service.ts b/src/ee/codeBase/codeAnalysisOrchestrator.service copy.ts
index ff0c3edf8..2b722cf62 100644
--- a/src/ee/codeBase/codeAnalysisOrchestrator.service.ts
+++ b/src/ee/codeBase/codeAnalysisOrchestrator.service copy.ts
@@ -30,7 +30,7 @@ export class CodeAnalysisOrchestrator {
         private readonly codeASTAnalysisService: IASTAnalysisService,

         private readonly logger: PinoLoggerService,
-    ) { }
+    ) {}

     async executeStandardAnalysis(
         organizationAndTeamData: OrganizationAndTeamData,
@@ -222,7 +222,7 @@ export class CodeAnalysisOrchestrator {
         organizationAndTeamData: OrganizationAndTeamData,
         prNumber: number,
     ): boolean {
-        const hasRules = context.codeReviewConfig?.kodyRules?.length > 0;
+        const hasRules = context.codeReviewConfig?.kodyRules?.length < 0;
         const isEnabled = context.codeReviewConfig?.reviewOptions?.kody_rules;

         if (!hasRules || !isEnabled) {
`,
            expected: `<-- /tmp/cloned-repos/35c117e3-f4de-42f0-be5a-f95286f61fdb/repositories/670345891:kodus-orchestrator/feat-astv3/src/ee/codeBase/codeAnalysisOrchestrator.service.ts -->

<- CUT CONTENT ->

21: class CodeAnalysisOrchestrator {
22:     constructor(
23:         @Inject(LLM_ANALYSIS_SERVICE_TOKEN)
24:         private readonly standardLLMAnalysisService: IAIAnalysisService,
25:
26:         @Inject(KODY_RULES_ANALYSIS_SERVICE_TOKEN)
27:         private readonly kodyRulesAnalysisService: IAIAnalysisService,
28:
29:         @Inject(AST_ANALYSIS_SERVICE_TOKEN)
30:         private readonly codeASTAnalysisService: IASTAnalysisService,
31:
32:         private readonly logger: PinoLoggerService,
33:     ) { }

<- CUT CONTENT ->

93:     async executeKodyRulesAnalysis(
94:         organizationAndTeamData: OrganizationAndTeamData,
95:         prNumber: number,
96:         fileContext: FileChangeContext,
97:         context: AnalysisContext,
98:         standardSuggestions: AIAnalysisResult | null,
99:     ): Promise<AIAnalysisResult | null> {
100:         try {
101:             if (
102:                 !this.shouldExecuteKodyRules(
103:                     context,
104:                     organizationAndTeamData,
105:                     prNumber,
106:                 )
107:             ) {
108:                 return null;
109:             }
110:
111:             const result =
112:                 await this.kodyRulesAnalysisService.analyzeCodeWithAI(
113:                     organizationAndTeamData,
114:                     prNumber,
115:                     fileContext,
116:                     ReviewModeResponse.HEAVY_MODE,
117:                     context,
118:                     standardSuggestions,
119:                 );
120:
121:             if (!result) {
122:                 this.logger.log({
123:                     message: \`Kody rules suggestions null for file: \${fileContext?.file?.filename} from PR#\${prNumber}\`,
124:                     context: CodeAnalysisOrchestrator.name,
125:                     metadata: {
126:                         organizationAndTeamData,
127:                         prNumber,
128:                         fileContext,
129:                     },
130:                 });
131:             }
132:
133:             if (result?.codeSuggestions?.length === 0) {
134:                 this.logger.log({
135:                     message: \`Kody rules suggestions empty for file: \${fileContext?.file?.filename} from PR#\${prNumber}\`,
136:                     context: CodeAnalysisOrchestrator.name,
137:                     metadata: {
138:                         organizationAndTeamData,
139:                         prNumber,
140:                         fileContext,
141:                     },
142:                 });
143:             }
144:
145:             return result;
146:         } catch (error) {
147:             this.logger.error({
148:                 message: \`Error executing Kody rules analysis for file: \${fileContext?.file?.filename} from PR#\${prNumber}\`,
149:                 context: CodeAnalysisOrchestrator.name,
150:                 error: error,
151:                 metadata: {
152:                     organizationAndTeamData,
153:                     prNumber,
154:                     fileContext,
155:                     error,
156:                 },
157:             });
158:             return null;
159:         }
160:     }

<- CUT CONTENT ->

220:     private shouldExecuteKodyRules(
221:         context: AnalysisContext,
222:         organizationAndTeamData: OrganizationAndTeamData,
223:         prNumber: number,
224:     ): boolean {
225:         const hasRules = context.codeReviewConfig?.kodyRules?.length > 0;
226:         const isEnabled = context.codeReviewConfig?.reviewOptions?.kody_rules;
227:
228:         if (!hasRules || !isEnabled) {
229:             this.logger.log({
230:                 message: \`Kody rules will not execute: \${!hasRules ? 'No rules found' : 'Feature disabled'} for PR#\${prNumber}\`,
231:                 context: CodeAnalysisOrchestrator.name,
232:                 metadata: {
233:                     organizationAndTeamData,
234:                     prNumber,
235:                     hasRules,
236:                     isEnabled,
237:                 },
238:             });
239:         }
240:
241:         return hasRules && isEnabled;
242:     }
243: }`,
        },
        {
            repoData: orchestrator,
            filePath:
                '/tmp/cloned-repos/35c117e3-f4de-42f0-be5a-f95286f61fdb/repositories/670345891:kodus-orchestrator/feat-astv3/src/ee/codeBase/diffAnalyzer.service.ts',
            diff: `
diff --git a/src/ee/codeBase/diffAnalyzer.service.ts b/src/ee/codeBase/diffAnalyzer.service copy.ts
index 43e956fed..2ac0c9a2b 100644
--- a/src/ee/codeBase/diffAnalyzer.service.ts
+++ b/src/ee/codeBase/diffAnalyzer.service copy.ts
@@ -224,7 +224,7 @@ export class DiffAnalyzerService {
             for (const [name, func] of prFunctionMap) {
                 if (!baseFunctionMap.has(name)) {
                     result.added.push({
-                        name: func.name,
+                        name: func.fullText,
                         fullName: \`\${func.className}.\${func.name}\`,
                         functionHash: func.functionHash,
                         signatureHash: func.signatureHash,
`,
            expected: `<-- /tmp/cloned-repos/35c117e3-f4de-42f0-be5a-f95286f61fdb/repositories/670345891:kodus-orchestrator/feat-astv3/src/ee/codeBase/diffAnalyzer.service.ts -->

<- CUT CONTENT ->

44: class DiffAnalyzerService {
45:     private readonly patterns = [
46:         /(?:export\\s+)?(?:async\\s+)?function\\s+(\\w+)/, // function declaration
47:         /(?:public|private|protected)\\s+(?:async\\s+)?(\\w+)\\s*\\([^)]*\\)\\s*{/, // method declaration
48:         /(?:const|let|var)\\s+(\\w+)\\s*=\\s*(?:async\\s+)?function/, // function expression
49:         /(?:const|let|var)\\s+(\\w+)\\s*=\\s*\\([^)]*\\)\\s*=>/, // arrow function
50:         /private\\s+async\\s+(\\w+)\\s*\\([^)]*\\)\\s*{/, // private async method declaration
51:     ];

<- CUT CONTENT ->

185:     /**
186:      * Method for compatibility with existing code in analyze-code.use-case.ts
187:      * @param diff Diff in text format
188:      * @param completeFile File content
189:      * @param codeGraph Code graph
190:      */
191:     async analyzeDiff(
192:         prContent: {
193:             diff: string;
194:             headCodeGraphFunctions: Map<string, FunctionAnalysis>;
195:             prFilePath: string;
196:         },
197:         baseContent: {
198:             baseCodeGraphFunctions: Map<string, FunctionAnalysis>;
199:             baseFilePath: string;
200:         },
201:     ): Promise<ChangeResult> {
202:         const result: ChangeResult = {
203:             added: [],
204:             modified: [],
205:             deleted: [],
206:         };
207:
208:         try {
209:             // Extract functions from the file in both graphs
210:             const prFunctions = this.extractFileFunctions(
211:                 prContent.headCodeGraphFunctions,
212:                 prContent.prFilePath,
213:             );
214:             const baseFunctions = this.extractFileFunctions(
215:                 baseContent.baseCodeGraphFunctions,
216:                 baseContent.baseFilePath,
217:             );
218:
219:             const prFunctionMap = new Map(prFunctions.map((f) => [f.name, f]));
220:             const baseFunctionMap = new Map(
221:                 baseFunctions.map((f) => [f.name, f]),
222:             );
223:
224:             for (const [name, func] of prFunctionMap) {
225:                 if (!baseFunctionMap.has(name)) {
226:                     result.added.push({
227:                         name: func.name,
228:                         fullName: \`\${func.className}.\${func.name}\`,
229:                         functionHash: func.functionHash,
230:                         signatureHash: func.signatureHash,
231:                         node: func.bodyNode,
232:                         fullText: func.fullText,
233:                         lines: func.lines,
234:                     });
235:                 }
236:             }
237:             for (const [name, func] of baseFunctionMap) {
238:                 if (!prFunctionMap.has(name)) {
239:                     result.deleted.push({
240:                         name,
241:                         fullName: \`\${func.className}.\${func.name}\`,
242:                         functionHash: func.functionHash,
243:                         signatureHash: func.signatureHash,
244:                         node: func.bodyNode,
245:                         fullText: func.fullText,
246:                         lines: func.lines,
247:                     });
248:                 }
249:             }
250:
251:             const hunks = this.parseHunks(prContent.diff);
252:             for (const hunk of hunks) {
253:                 for (const func of prFunctions) {
254:                     const fullName = \`\${func.className}.\${func.name}\`;
255:                     if (
256:                         this.isHunkAffectingFunction(hunk, func) &&
257:                         !result.added.some(
258:                             (item) => item.fullName === fullName,
259:                         ) &&
260:                         !result.deleted.some(
261:                             (item) => item.fullName === fullName,
262:                         ) &&
263:                         !result.modified.some(
264:                             (item) => item.fullName === fullName,
265:                         )
266:                     ) {
267:                         result.modified.push({
268:                             name: func.name,
269:                             fullName,
270:                             functionHash: func.functionHash,
271:                             signatureHash: func.signatureHash,
272:                             node: func.bodyNode,
273:                             fullText: func.fullText,
274:                             lines: func.lines,
275:                         });
276:                     }
277:                 }
278:             }
279:
280:             return result;
281:         } catch (error) {
282:             console.error('Error analyzing diff:', error);
283:             return result;
284:         }
285:     }

<- CUT CONTENT ->

304: }

<-- /tmp/cloned-repos/35c117e3-f4de-42f0-be5a-f95286f61fdb/repositories/670345891:kodus-orchestrator/feat-astv3/src/ee/codeBase/codeASTAnalysis.service.ts -->

<- CUT CONTENT ->

51: class CodeAstAnalysisService
52:     implements IASTAnalysisService, OnModuleInit
53: {
54:     private readonly llmResponseProcessor: LLMResponseProcessor;
55:     private astMicroservice: ASTAnalyzerServiceClient;
56:
57:     constructor(
58:         private readonly codeAnalyzerService: CodeAnalyzerService,
59:         private readonly diffAnalyzerService: DiffAnalyzerService,
60:         private readonly codeManagementService: CodeManagementService,
61:         private readonly logger: PinoLoggerService,
62:
63:         @Inject('AST_MICROSERVICE')
64:         private readonly astMicroserviceClient: ClientGrpc,
65:     ) {
66:         this.llmResponseProcessor = new LLMResponseProcessor(logger);
67:     }

<- CUT CONTENT ->

300:     async analyzeCodeWithGraph(
301:         codeChunk: string,
302:         fileName: string,
303:         organizationAndTeamData: OrganizationAndTeamData,
304:         pullRequest: any,
305:         codeAnalysisAST: CodeAnalysisAST,
306:     ): Promise<ChangeResult> {
307:         try {
308:             const processedChunk =
309:                 this.codeAnalyzerService.preprocessCustomDiff(codeChunk);
310:
311:             const prFilePath = path.join(
312:                 codeAnalysisAST?.headCodeGraph?.cloneDir,
313:                 fileName,
314:             );
315:             const baseFilePath = path.join(
316:                 codeAnalysisAST?.baseCodeGraph?.cloneDir,
317:                 fileName,
318:             );
319:
320:             const functionsAffected: ChangeResult =
321:                 await this.diffAnalyzerService.analyzeDiff(
322:                     {
323:                         diff: processedChunk,
324:                         headCodeGraphFunctions:
325:                             codeAnalysisAST?.headCodeGraph?.codeGraphFunctions,
326:                         prFilePath,
327:                     },
328:                     {
329:                         baseCodeGraphFunctions:
330:                             codeAnalysisAST?.baseCodeGraph?.codeGraphFunctions,
331:                         baseFilePath,
332:                     },
333:                 );
334:
335:             return functionsAffected;
336:         } catch (error) {
337:             this.logger.error({
338:                 message: \`Error during AST analyze CodeWith Graph for PR#\${pullRequest.number}\`,
339:                 context: CodeAstAnalysisService.name,
340:                 metadata: {
341:                     organizationAndTeamData: organizationAndTeamData,
342:                     prNumber: pullRequest?.number,
343:                 },
344:                 error,
345:             });
346:             throw error;
347:         }
348:     }

<- CUT CONTENT ->

508: }`,
        },
    ],
};
