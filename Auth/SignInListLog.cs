using System;
using System.Collections.Concurrent;
using System.Linq;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Profiles.Auth
{
    /// <summary>
    /// How loudly to log why a sign-in screen got no profiles.
    ///
    /// <para>Until 2.0.1 every reason was Debug, because <c>GET /Users/Public</c> is anonymous and
    /// anybody can trigger one. So the log of a household whose television showed no profiles said
    /// nothing about why, and finding out meant asking them to change Jellyfin's logging and try
    /// again (#46). Once per device keeps that to a line per television per ten minutes, and the cap
    /// keeps a caller rotating made-up device ids from filling the log or the memory.</para>
    ///
    /// <para>A class of its own, not part of <see cref="PublicUserInjector"/>: that file must never
    /// remove anything (tests/js/publicusers.js looks for any Remove or Clear in it), and this one
    /// has to forget old devices.</para>
    /// </summary>
    internal static class SignInListLog
    {
        /// <summary>When each device was last told.</summary>
        private static readonly ConcurrentDictionary<string, DateTime> _logged = new(StringComparer.OrdinalIgnoreCase);

        /// <summary>How often one device's reason is logged at Information.</summary>
        internal static readonly TimeSpan Interval = TimeSpan.FromMinutes(10);

        /// <summary>Devices remembered for that. Past it, reasons go to Debug until the oldest age out.</summary>
        internal const int MaxDevices = 200;

        /// <summary>Information once per device per <see cref="Interval"/>, Debug otherwise.</summary>
        internal static LogLevel DeclineLevel(string? deviceId, DateTime nowUtc)
        {
            var key = string.IsNullOrWhiteSpace(deviceId) ? "(none)" : deviceId.Trim();
            if (_logged.TryGetValue(key, out var last) && nowUtc - last < Interval) return LogLevel.Debug;

            if (_logged.Count >= MaxDevices)
            {
                foreach (var old in _logged.Where(p => nowUtc - p.Value >= Interval).Select(p => p.Key).ToList())
                {
                    _logged.TryRemove(old, out _);
                }

                if (_logged.Count >= MaxDevices) return LogLevel.Debug;
            }

            _logged[key] = nowUtc;
            return LogLevel.Information;
        }

        /// <summary>For harnesses: forget which devices were logged.</summary>
        internal static void Reset() => _logged.Clear();
    }
}
