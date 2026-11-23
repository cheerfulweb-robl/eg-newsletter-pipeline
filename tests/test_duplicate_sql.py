import os
import unittest

class TestDuplicateSQLMigration(unittest.TestCase):
    def setUp(self):
        self.migration_path = os.path.join(
            os.path.dirname(os.path.dirname(__file__)),
            'supabase',
            'migrations',
            '20261214_duplicate_listing_detection.sql'
        )

    def test_migration_file_exists(self):
        self.assertTrue(os.path.exists(self.migration_path), f"Migration file not found at {self.migration_path}")

    def test_migration_contents(self):
        with open(self.migration_path, 'r', encoding='utf-8') as f:
            content = f.read()

        # Check required components
        self.assertIn('pg_trgm', content)
        self.assertIn('is_suspected_duplicate', content)
        self.assertIn('duplicate_match_id', content)
        self.assertIn('duplicate_score', content)
        self.assertIn('duplicate_notes', content)
        self.assertIn('wg_check_listing_duplicate', content)
        self.assertIn('security definer', content.lower())
        self.assertIn('grant execute on function public.wg_check_listing_duplicate', content.lower())
        
        # Verify no destructive drops
        self.assertNotIn('drop table', content.lower())
        self.assertNotIn('drop column', content.lower())

if __name__ == '__main__':
    unittest.main()
