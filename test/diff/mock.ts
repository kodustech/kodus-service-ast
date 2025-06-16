import { SupportedLanguage } from '@/core/domain/ast/types/supported-languages';

type FileDiff = {
    filePath: string;
    diff: string;
    content: string;
    expected: string;
};

type MockData = {
    [key in SupportedLanguage]: FileDiff[];
};

export const mockData: Partial<MockData> = {
    typescript: [
        {
            filePath: 'src/core/application/use-cases/codeBase/diff_test/b.ts',
            diff: `
diff --git a/src/core/application/use-cases/codeBase/diff_test/a.ts b/src/core/application/use-cases/codeBase/diff_test/b.ts
index 1f66838e6..9e86d0b4b 100644
--- a/src/core/application/use-cases/codeBase/diff_test/a.ts
+++ b/src/core/application/use-cases/codeBase/diff_test/b.ts
@@ -9,6 +9,7 @@ class Foo {
     }

     foo() {
+        console.log('foo called');
         console.log('Hello, world!');
     }
`,
            content: `class Foo {
    private _privateProperty: string;

    constructor(
        privateProperty: string,
        private readonly anotherProperty?: string,
    ) {
        this._privateProperty = privateProperty;
    }

    foo() {
        console.log('foo called');
        console.log('Hello, world!');
    }

    baz() {
        console.log('baz called');
    }

    bar() {
        this.foo();
        console.log('Goodbye, world!');
    }
}`,
            expected: `class Foo {
    private _privateProperty: string;

    constructor(
        privateProperty: string,
        private readonly anotherProperty?: string,
    ) {
        this._privateProperty = privateProperty;
    }

    foo() {
        console.log('foo called');
        console.log('Hello, world!');
    }

    bar() {
        this.foo();
        console.log('Goodbye, world!');
    }
}`,
        },
    ],
};
