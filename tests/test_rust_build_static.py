from pathlib import Path
import unittest


PROJECT_ROOT = Path(__file__).resolve().parents[1]


class RustBuildStaticTests(unittest.TestCase):
    def test_mix_rebuilds_audio_engine_when_rust_sources_are_newer(self) -> None:
        mix_exs = (PROJECT_ROOT / "mix.exs").read_text(encoding="utf-8")

        self.assertIn("source_newer? = rust_source_newer?(native_dir, native_binary)", mix_exs)
        self.assertIn("and not source_newer? do", mix_exs)
        self.assertIn("defp rust_source_newer?(native_dir, native_binary) do", mix_exs)
        self.assertIn('Path.join([native_dir, "src", "**", "*.rs"])', mix_exs)
        self.assertIn('Path.join(native_dir, "Cargo.toml")', mix_exs)
        self.assertIn('Path.join(native_dir, "Cargo.lock")', mix_exs)
        self.assertIn('Path.join(native_dir, "build.rs")', mix_exs)

    def test_mix_unlocks_windows_audio_engine_before_release_build(self) -> None:
        mix_exs = (PROJECT_ROOT / "mix.exs").read_text(encoding="utf-8")

        self.assertIn("release_windows_native_binary(native_binary)", mix_exs)
        self.assertIn("windows_runtime_target_dir(native_dir)", mix_exs)
        self.assertIn('["build", "--release", "--target-dir", windows_target_dir]', mix_exs)
        self.assertIn("copy_windows_built_binary(built_binary, native_binary)", mix_exs)
        self.assertIn('System.cmd("taskkill", ["/IM", "audio_engine.exe", "/F", "/T"]', mix_exs)
        self.assertIn("defp wait_for_windows_binary_release(native_binary, attempts_left)", mix_exs)
        self.assertIn("File.rename(native_binary, check_path)", mix_exs)
        self.assertIn("Windows still refuses write access", mix_exs)


if __name__ == "__main__":
    unittest.main()
