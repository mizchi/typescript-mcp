pub fn fixed_function() -> String {
  let x : String = "hello"
  let y : Int = 42
  // 文字列連結を使用
  x + y.to_string()
}

pub fn another_fixed() -> String {
  // Int を String に変換
  "123"
}

pub fn fixed_variable() -> Unit {
  // 変数を定義してから使用
  let defined_var = "This is defined"
  println(defined_var)
}