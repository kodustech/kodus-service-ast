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
        private readonly anotherProperty?: string
    ) {
        this._privateProperty = privateProperty;
    }

    foo() {
        console.log("foo called");
        console.log("Hello, world!");
    }

    baz() {
        console.log("baz called");
    }

    bar() {
        this.foo();
        console.log("Goodbye, world!");
        console.log("bar called");
    }
}`,
            expected: `1: class Foo {
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

18:
19:
20:     bar() {
21:         this.foo();
22:         console.log("Goodbye, world!");
23:         console.log("bar called");
24:     }
25: }`,
        },
        {
            filePath: 'src/simple/2/b.ts',
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

function baz() {
    console.log("baz called");
    console.log("baz baz baz");
}`,
            expected: `
<- CUT CONTENT ->

21: function baz() {
22:     console.log("baz called");
23:     console.log("baz baz baz");
24: }`,
        },
        {
            filePath: 'src/simple/3/b.ts',
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

    baz() {
        console.log("baz called");
    }
}

function baz() {
    const foo = new Foo("privateValue", "anotherValue");

    foo.foo();

    console.log("baz called");
    console.log("baz baz baz");
}`,
            expected: `
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
            filePath: 'src/simple/4/b.ts',
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
            content: `class Foo {
    private _privateProperty: string;

    constructor(
        privateProperty: string,
        private readonly anotherProperty?: string
    ) {
        this._privateProperty = privateProperty;
    }

    foo() {
        console.log("foo called");
        console.log("Hello, world!");
    }

    bar() {
        this.foo();
        console.log("Goodbye, world!");
    }

    baz() {
        console.log("baz called");
    }
}

function baz() {
    const foo = new Foo("privateValue", "anotherValue");

    foo.foo();

    console.log("baz called");
}`,
            expected: `1: class Foo {
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

23:
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
    ],
};
