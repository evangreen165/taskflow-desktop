//! `#[write_command]` — a Tauri command wrapper that also injects the
//! `require_writable` guard.
//!
//! Usage:
//! ```ignore
//! #[write_command(rename = "writeJsonAtomic")]
//! pub fn write_json_atomic(state: State<'_, AppState>, path: String, value: Value)
//!     -> Result<(), AppError> { … }
//! ```
//!
//! Expands to `#[tauri::command(rename = "…")]` plus a first statement
//! `let _guard = state.require_writable()?;` so a `mustChangePassword` session
//! can never bypass the guard on a write command.

use proc_macro::TokenStream;
use quote::quote;
use syn::{Attribute, Expr, FnArg, Ident, ItemFn, Lit, Meta, Pat, Type};

#[proc_macro_attribute]
pub fn write_command(attr: TokenStream, item: TokenStream) -> TokenStream {
    write_command_impl(attr.into(), item.into())
        .unwrap_or_else(syn::Error::into_compile_error)
        .into()
}

fn write_command_impl(
    attr: proc_macro2::TokenStream,
    item: proc_macro2::TokenStream,
) -> syn::Result<proc_macro2::TokenStream> {
    let rename = parse_rename(attr)?;
    let mut func: ItemFn = syn::parse2(item)?;
    let state = find_state_param(&func)?;

    let guard: syn::Stmt = syn::parse_quote! {
        let _guard = #state.require_writable()?;
    };
    func.block.stmts.insert(0, guard);

    let command_attr: Attribute = syn::parse_quote!(#[tauri::command(rename = #rename)]);
    func.attrs.insert(0, command_attr);

    Ok(quote! { #func })
}

fn parse_rename(attr: proc_macro2::TokenStream) -> syn::Result<String> {
    let meta = syn::parse2::<Meta>(attr)?;
    match meta {
        Meta::NameValue(nv) if nv.path.is_ident("rename") => match nv.value {
            Expr::Lit(pl) => match pl.lit {
                Lit::Str(s) => Ok(s.value()),
                _ => Err(syn::Error::new_spanned(pl, "rename must be a string literal")),
            },
            _ => Err(syn::Error::new_spanned(
                nv.value,
                "rename must be a string literal",
            )),
        },
        other => Err(syn::Error::new_spanned(
            other,
            "expected `rename = \"...\"`",
        )),
    }
}

fn find_state_param(func: &ItemFn) -> syn::Result<Ident> {
    for input in &func.sig.inputs {
        if let FnArg::Typed(pt) = input {
            if let Pat::Ident(pid) = &*pt.pat {
                if is_state_type(&pt.ty) {
                    return Ok(pid.ident.clone());
                }
            }
        }
    }
    Err(syn::Error::new_spanned(
        &func.sig,
        "write_command requires a `state: State<'_, AppState>` parameter",
    ))
}

fn is_state_type(ty: &Type) -> bool {
    if let Type::Path(tp) = ty {
        if let Some(seg) = tp.path.segments.last() {
            return seg.ident == "State";
        }
    }
    false
}
