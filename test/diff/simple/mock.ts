import { SupportedLanguage } from '@/core/domain/parsing/types/supported-languages';

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
            filePath: 'src/simple/1/b.ts',
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
        console.log('bar called');
    }
}
`,
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
        console.log('bar called');
    }
}`,
        },
        {
            filePath: 'src/simple/2/b.ts',
            diff: `
diff --git a/src/simple/2/a.ts b/src/simple/2/b.ts
index 29fbb7d..aa77ba3 100644
--- a/src/simple/2/a.ts
+++ b/src/simple/2/b.ts
@@ -20,4 +20,5 @@ class Foo {

 baz() {
     console.log("baz called");
+    console.log("baz baz baz");
 }
`,
            content: `class Foo {
    private _privateProperty: string;

    constructor(
        privateProperty: string,
        private readonly anotherProperty?: string
    ) {
        this._privateProperty = privateProperty;
    }

    foo() {
        console.log("Hello, world!");
    }

    bar() {
        this.foo();
        console.log("Goodbye, world!");
    }
}

baz() {
    console.log("baz called");
    console.log("baz baz baz");
}
`,
            expected: `baz() {
    console.log("baz called");
    console.log("baz baz baz");
}`,
        },
    ],
};
