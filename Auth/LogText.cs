namespace Jellyfin.Profiles.Auth
{
    /// <summary>
    /// Request text made safe to put in a log line.
    ///
    /// <para><b>Why.</b> The header parser URL-decodes, so <c>Device="x%0A[INF] fake line"</c> reaches
    /// the code as a real newline, and Jellyfin writes log arguments raw. Anyone who can send a request
    /// could add lines to the server log. Wrap every log argument that came from a request (device id,
    /// client, username typed, request path, an uploaded header). <c>tests/js/logforge.js</c> fails a
    /// log call that names one of those without this.</para>
    ///
    /// <para><b>Why not clean it where it is read.</b> A device id is matched against the ids stored,
    /// so changing it in <see cref="RequestDevice"/> would stop a device matching itself. Only the
    /// copy that goes to the log is changed.</para>
    /// </summary>
    internal static class LogText
    {
        /// <summary>
        /// The longest device id the plugin records. Not shorter: a browser's id is about 170
        /// characters and a television browser's can pass 250, and the part that tells two of them
        /// apart is the time at the end. A log cut at 120 would show every browser as the same
        /// device, in exactly the reports that need to tell them apart.
        /// </summary>
        private const int MaxLength = DeviceRegistry.MaxDeviceIdLength;

        /// <summary>
        /// Every control character and the Unicode line and paragraph separators become '?', the
        /// text is cut at <see cref="MaxLength"/> characters with an ellipsis, and null reads "(none)".
        /// </summary>
        public static string Clean(string? text)
        {
            if (text == null) return "(none)";

            var cut = text.Length > MaxLength;
            var length = cut ? MaxLength : text.Length;
            var chars = new char[cut ? length + 1 : length];
            for (var i = 0; i < length; i++)
            {
                var c = text[i];
                chars[i] = char.IsControl(c) || (int)c == 0x2028 || (int)c == 0x2029 ? '?' : c;
            }

            if (cut) chars[length] = (char)0x2026;
            return new string(chars);
        }
    }
}
