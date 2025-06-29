module Calculator

// 基本的な算術演算
let add x y = x + y
let subtract x y = x - y
let multiply x y = x * y
let divide x y = 
    if y = 0 then 
        failwith "Division by zero"
    else 
        x / y

// 高階関数の例
let applyOperation op x y = op x y

// レコード型
type CalculationResult = {
    Operation: string
    Result: int
}

// 計算を実行して結果を返す
let calculate opName x y =
    let result = 
        match opName with
        | "add" -> add x y
        | "subtract" -> subtract x y
        | "multiply" -> multiply x y
        | "divide" -> divide x y
        | _ -> failwith "Unknown operation"
    { Operation = opName; Result = result }

// パターンマッチングの例
let describeNumber n =
    match n with
    | 0 -> "Zero"
    | n when n > 0 -> "Positive"
    | _ -> "Negative"

// リスト操作
let sumList numbers =
    List.fold (+) 0 numbers

// エラーを含むコード（テスト用）
let buggyFunction x =
    let y = unknownVariable // エラー: unknownVariable is not defined
    x + y

// 型エラーのテスト
let typeError: string = 123 // エラー: int を string に代入