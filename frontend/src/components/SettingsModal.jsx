import React from "react";
import { Save, X } from "lucide-react";
import { mergeJobSettings } from "../jobUtils.js";

const COMPUTE_TYPES = [
  "default",
  "auto",
  "int8",
  "int8_float16",
  "int8_float32",
  "int16",
  "float16",
  "float32",
  "bfloat16",
];

const LANGUAGE_OPTIONS = [
  { value: "", label: "Auto detect" },
  { value: "en", label: "English" },
  { value: "zh", label: "Chinese" },
  { value: "de", label: "German" },
  { value: "es", label: "Spanish" },
  { value: "ru", label: "Russian" },
  { value: "ko", label: "Korean" },
  { value: "fr", label: "French" },
  { value: "ja", label: "Japanese" },
  { value: "pt", label: "Portuguese" },
  { value: "tr", label: "Turkish" },
  { value: "pl", label: "Polish" },
  { value: "ca", label: "Catalan" },
  { value: "nl", label: "Dutch" },
  { value: "ar", label: "Arabic" },
  { value: "sv", label: "Swedish" },
  { value: "it", label: "Italian" },
  { value: "id", label: "Indonesian" },
  { value: "hi", label: "Hindi" },
  { value: "fi", label: "Finnish" },
  { value: "vi", label: "Vietnamese" },
  { value: "he", label: "Hebrew" },
  { value: "uk", label: "Ukrainian" },
  { value: "el", label: "Greek" },
  { value: "ms", label: "Malay" },
  { value: "cs", label: "Czech" },
  { value: "ro", label: "Romanian" },
  { value: "da", label: "Danish" },
  { value: "hu", label: "Hungarian" },
  { value: "ta", label: "Tamil" },
  { value: "no", label: "Norwegian" },
  { value: "th", label: "Thai" },
  { value: "ur", label: "Urdu" },
  { value: "hr", label: "Croatian" },
  { value: "bg", label: "Bulgarian" },
  { value: "lt", label: "Lithuanian" },
  { value: "la", label: "Latin" },
  { value: "mi", label: "Maori" },
  { value: "ml", label: "Malayalam" },
  { value: "cy", label: "Welsh" },
  { value: "sk", label: "Slovak" },
  { value: "te", label: "Telugu" },
  { value: "fa", label: "Persian" },
  { value: "lv", label: "Latvian" },
  { value: "bn", label: "Bengali" },
  { value: "sr", label: "Serbian" },
  { value: "az", label: "Azerbaijani" },
  { value: "sl", label: "Slovenian" },
  { value: "kn", label: "Kannada" },
  { value: "et", label: "Estonian" },
  { value: "mk", label: "Macedonian" },
  { value: "br", label: "Breton" },
  { value: "eu", label: "Basque" },
  { value: "is", label: "Icelandic" },
  { value: "hy", label: "Armenian" },
  { value: "ne", label: "Nepali" },
  { value: "mn", label: "Mongolian" },
  { value: "bs", label: "Bosnian" },
  { value: "kk", label: "Kazakh" },
  { value: "sq", label: "Albanian" },
  { value: "sw", label: "Swahili" },
  { value: "gl", label: "Galician" },
  { value: "mr", label: "Marathi" },
  { value: "pa", label: "Punjabi" },
  { value: "si", label: "Sinhala" },
  { value: "km", label: "Khmer" },
  { value: "sn", label: "Shona" },
  { value: "yo", label: "Yoruba" },
  { value: "so", label: "Somali" },
  { value: "af", label: "Afrikaans" },
  { value: "oc", label: "Occitan" },
  { value: "ka", label: "Georgian" },
  { value: "be", label: "Belarusian" },
  { value: "tg", label: "Tajik" },
  { value: "sd", label: "Sindhi" },
  { value: "gu", label: "Gujarati" },
  { value: "am", label: "Amharic" },
  { value: "yi", label: "Yiddish" },
  { value: "lo", label: "Lao" },
  { value: "uz", label: "Uzbek" },
  { value: "fo", label: "Faroese" },
  { value: "ht", label: "Haitian Creole" },
  { value: "ps", label: "Pashto" },
  { value: "tk", label: "Turkmen" },
  { value: "nn", label: "Nynorsk" },
  { value: "mt", label: "Maltese" },
  { value: "sa", label: "Sanskrit" },
  { value: "lb", label: "Luxembourgish" },
  { value: "my", label: "Myanmar" },
  { value: "bo", label: "Tibetan" },
  { value: "tl", label: "Tagalog" },
  { value: "mg", label: "Malagasy" },
  { value: "as", label: "Assamese" },
  { value: "tt", label: "Tatar" },
  { value: "haw", label: "Hawaiian" },
  { value: "ln", label: "Lingala" },
  { value: "ha", label: "Hausa" },
  { value: "ba", label: "Bashkir" },
  { value: "jw", label: "Javanese" },
  { value: "su", label: "Sundanese" },
];

export function SettingsModal({ jobSettings, modelOptions, onChangeJobSetting, onClose, onSaveSettings, settings }) {
  const hasStoredToken = Boolean(settings?.hf_token_stored);
  const isMaskingStoredToken = hasStoredToken && !jobSettings.diarization_token;

  function preventCopyOut(event) {
    event.preventDefault();
  }

  function blockCopyCutShortcuts(event) {
    if (!(event.metaKey || event.ctrlKey)) return;
    const key = event.key.toLowerCase();
    if (key === "c" || key === "x") {
      event.preventDefault();
    }
  }

  return (
    <div className="modal-backdrop modal-backdrop--settings" role="presentation" onMouseDown={onClose}>
      <section
        className="settings-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <div className="panel-kicker">Defaults</div>
            <h2 id="settings-title">Settings</h2>
          </div>
          <button type="button" className="icon-button" aria-label="Close settings" onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        <form onSubmit={onSaveSettings} key={JSON.stringify(settings)}>
          <label>
            Diarization/HF token
            <input
              name="diarization_token"
              type="password"
              aria-label="Diarization/HF token"
              value={isMaskingStoredToken ? "••••••••••••" : jobSettings.diarization_token || ""}
              onChange={(event) => {
                const value = event.target.value;
                if (isMaskingStoredToken) {
                  onChangeJobSetting("diarization_token", value.replace(/^•+/, ""));
                  return;
                }
                onChangeJobSetting("diarization_token", value);
              }}
              onCopy={preventCopyOut}
              onCut={preventCopyOut}
              onContextMenu={preventCopyOut}
              onKeyDown={blockCopyCutShortcuts}
              placeholder={hasStoredToken ? "Stored securely in backend" : "Optional (enables pyannote diarization)"}
            />
          </label>
          <SettingsFields settings={mergeJobSettings(settings)} modelOptions={modelOptions} />
          <button type="submit">
            <Save size={16} /> Save
          </button>
        </form>
      </section>
    </div>
  );
}

function SettingsFields({ settings, modelOptions }) {
  return (
    <>
      <label>
        Transcription engine
        <input name="transcription_engine" defaultValue={settings.transcription_engine} readOnly />
      </label>
      <label>
        Transcription model
        <select name="transcription_model" defaultValue={settings.transcription_model}>
          {modelOptions.transcription_models.map((model) => (
            <option value={model.id} key={model.id}>
              {model.id}
            </option>
          ))}
        </select>
      </label>
      <label>
        Diarization engine
        <input name="diarization_engine" defaultValue={settings.diarization_engine} readOnly />
      </label>
      <label>
        Diarization model
        <select name="diarization_model" defaultValue={settings.diarization_model}>
          {modelOptions.diarization_models.map((model) => (
            <option value={model.id} key={model.id}>
              {model.id}
            </option>
          ))}
        </select>
      </label>
      <LanguageCombobox defaultValue={settings.language || ""} />
      <label>
        Device
        <select name="device" defaultValue={settings.device}>
          <option value="auto">auto</option>
          <option value="cpu">cpu</option>
          <option value="cuda">cuda</option>
        </select>
      </label>
      <label>
        Compute type
        <select name="compute_type" defaultValue={settings.compute_type}>
          {COMPUTE_TYPES.map((computeType) => (
            <option key={computeType} value={computeType}>
              {computeType}
            </option>
          ))}
        </select>
      </label>
      <label>
        Batch size
        <input name="batch_size" type="number" min="1" max="128" defaultValue={settings.batch_size} />
      </label>
    </>
  );
}

function LanguageCombobox({ defaultValue }) {
  const [query, setQuery] = React.useState(defaultValue);
  const [isOpen, setIsOpen] = React.useState(false);

  const filtered = React.useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return LANGUAGE_OPTIONS.slice(0, 20);
    return LANGUAGE_OPTIONS.filter((option) => {
      if (!option.value) return "auto".includes(normalized);
      const haystack = `${option.value} ${option.label}`.toLowerCase();
      return fuzzyIncludes(haystack, normalized);
    }).slice(0, 20);
  }, [query]);

  return (
    <label>
      Language
      <div className="settings-combobox">
        <input
          name="language"
          value={query}
          placeholder="Auto detect"
          autoComplete="off"
          onFocus={() => setIsOpen(true)}
          onBlur={() => {
            window.setTimeout(() => setIsOpen(false), 120);
          }}
          onChange={(event) => {
            const value = event.target.value;
            setQuery(value);
            setIsOpen(true);
          }}
        />
        {isOpen && filtered.length > 0 && (
          <ul className="settings-combobox__menu" role="listbox" aria-label="Language options">
            {filtered.map((option) => (
              <li key={option.value || "auto"}>
                <button
                  type="button"
                  className="settings-combobox__option"
                  onClick={() => {
                    setQuery(option.value);
                    setIsOpen(false);
                  }}
                >
                  <span>{option.label}</span>
                  <code>{option.value || "auto"}</code>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </label>
  );
}

function fuzzyIncludes(text, query) {
  let queryIndex = 0;
  for (let i = 0; i < text.length && queryIndex < query.length; i += 1) {
    if (text[i] === query[queryIndex]) queryIndex += 1;
  }
  return queryIndex === query.length;
}
