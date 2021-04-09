# @zppack/zp-pick

A middleware for zp to support pick files according to variable values

## Start

### Config

- middleware name: **@zppack/zp-pick**
- config file: **`.zp/.zp-pick.toml`**, TOML v1.0.
- config format: an object of pick options.

### Config Examples

```toml
# TOML v1.0
# pick file rules

# LICENSE file pick according to variable `license`
#   ignore cases;
#   support `!` mode;
license = 'i!'
```

### Document

Set supported match patterns for every pick rule. Each character indicates one pattern, and can be superimposed.

Supported characters are 'i', '!', '^', '$', '*', 'u'.

- **i**: Ignore case. Will add `i` flag in regular matching mode.
- **!**: Invert the result. In this case, matching value must start with `!`, or else this character flag will be ignored. Will be ignored in regular matching mode.
- **^**: Match beginning. Will automatically add `^` at the beginning of the regular expression in regular matching mode.
- **\$**: Match ending. Will add `$` at the end of the regular expression in regular matching mode.
- **\***: Fuzzy matching. Also a flag of turning on regular matching mode. In this case, the `"<dot>"` part of matching value will be replaced with `"."` first. (More than one of this character will be ignored.)
- **u**: Unicode mode. Only support in regular matching mode (*u), or else ignored.
- `y` and `s` flags are not supported.

## Contributing

[How to contribute to this?](CONTRIBUTING.md)

## Recently changes

See the [change log](CHANGELOG.md).

## License

[MIT](LICENSE)
