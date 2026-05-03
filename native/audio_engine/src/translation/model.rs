//! CTranslate2 translation model wrapper.
//!
//! Wraps ct2rs::Translator with SentencePiece tokenizer for a single
//! translation direction (e.g. ru→en or en→ru).

use std::path::Path;

use anyhow::{Context, Result};
use ct2rs::{Config, Device, Translator, TranslationOptions};
use log::debug;

/// Default beam size for translation (greedy = 1, beam = 2+).
/// Beam size 2 is a good balance between quality and speed.
const DEFAULT_BEAM_SIZE: usize = 2;

/// Maximum output length in tokens.
const MAX_DECODING_LENGTH: usize = 256;

/// A single-direction translation model backed by CTranslate2.
///
/// Holds the ct2rs Translator which internally manages the CTranslate2
/// inference engine and SentencePiece tokenizer.
pub struct TranslationModel {
    translator: Translator<ct2rs::tokenizers::sentencepiece::Tokenizer>,
}

// ct2rs::Translator is Send + Sync, so TranslationModel is too.
// This allows sharing the engine across threads.

impl TranslationModel {
    /// Load a CTranslate2 model from the given directory.
    ///
    /// The directory must contain:
    ///   - `model.bin` — CTranslate2 model weights
    ///   - `source.spm` — SentencePiece model for source language
    ///   - `target.spm` — SentencePiece model for target language
    pub fn new(model_dir: &Path) -> Result<Self> {
        // Verify required files exist
        let model_bin = model_dir.join("model.bin");
        if !model_bin.exists() {
            anyhow::bail!(
                "model.bin not found in {:?}. Run the export script first.",
                model_dir
            );
        }

        let source_spm = model_dir.join("source.spm");
        let target_spm = model_dir.join("target.spm");
        if !source_spm.exists() || !target_spm.exists() {
            anyhow::bail!(
                "source.spm or target.spm not found in {:?}. \
                 Ensure --copy_files source.spm target.spm was used during conversion.",
                model_dir
            );
        }

        let config = Config {
            device: Device::CPU,
            // Use all available CPU cores for this model replica
            num_threads_per_replica: 0, // 0 = auto-detect
            ..Config::default()
        };

        let tokenizer = ct2rs::tokenizers::sentencepiece::Tokenizer::new(model_dir)
            .context("failed to load SentencePiece tokenizer")?;

        let translator = Translator::with_tokenizer(model_dir, tokenizer, &config)
            .context("failed to create CTranslate2 translator")?;

        Ok(Self { translator })
    }

    /// Translate a single text string.
    ///
    /// Uses beam search with beam_size=2 for better quality.
    /// Returns the best hypothesis.
    pub fn translate(&self, text: &str) -> Result<String> {
        debug!("Translating: {:?}", text);

        let options = TranslationOptions::<String, String> {
            beam_size: DEFAULT_BEAM_SIZE,
            max_decoding_length: MAX_DECODING_LENGTH,
            ..Default::default()
        };

        let results = self
            .translator
            .translate_batch(&[text], &options, None)
            .context("CTranslate2 translation failed")?;

        let translated = results
            .into_iter()
            .next()
            .map(|(text, _score)| text)
            .unwrap_or_default();

        debug!("Translated result: {:?}", translated);
        Ok(translated)
    }
}
