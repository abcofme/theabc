import ipaddress
import unittest

from deploy.geo.update_ru_ips import render_matcher, russian_networks


class RussianNetworksTest(unittest.TestCase):
    def test_both_protocols_and_only_russian_addresses(self):
        networks = russian_networks([
            ["5.129.200.0", "5.129.200.255", "RU"],
            ["5.129.201.0", "5.129.201.255", "RU"],
            ["1.1.1.0", "1.1.1.255", "AU"],
            ["2001:db8::4", "2001:db8::7", "RU"],
            ["2001:db8::8", "2001:db8::f", "NL"],
        ])
        self.assertEqual([str(network) for network in networks], ["5.129.200.0/23", "2001:db8::4/126"])
        for value, expected in [("5.129.200.77", True), ("5.129.202.0", False), ("1.1.1.1", False),
                                ("2001:db8::4", True), ("2001:db8::7", True), ("2001:db8::8", False)]:
            address = ipaddress.ip_address(value)
            self.assertEqual(any(address in network for network in networks if network.version == address.version), expected)

    def test_bad_downloads_and_invalid_ranges_are_rejected(self):
        for rows in [
            [["<html>Bad gateway</html>"]],
            [["5.0.0.0", "5.0.0.1", "Russia"]],
            [["5.0.0.2", "5.0.0.1", "RU"]],
            [["5.0.0.1", "2001:db8::1", "RU"]],
        ]:
            with self.subTest(rows=rows), self.assertRaises(ValueError):
                russian_networks(rows)

    def test_generated_config_retains_attribution_and_source_digest(self):
        rendered = render_matcher([ipaddress.ip_network("5.129.200.0/24")], "2026-11", "a" * 64)
        self.assertIn("DB-IP IP to Country Lite, 2026-11", rendered)
        self.assertIn("https://creativecommons.org/licenses/by/4.0/", rendered)
        self.assertIn("Archive SHA-256: " + "a" * 64, rendered)
        self.assertTrue(rendered.endswith("remote_ip 5.129.200.0/24\n"))
        with self.assertRaises(ValueError):
            render_matcher([], "2026-13", "a" * 64)


if __name__ == "__main__":
    unittest.main()
