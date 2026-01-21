#!/usr/bin/env python3
"""
CSV Historical Data Analyzer
Checks for duplicate data in Historical Data CSV exports
"""

import csv
import sys
from collections import defaultdict
from pathlib import Path

def analyze_historical_data(csv_path):
    """Analyze Historical Data CSV for duplicates and provide summary statistics."""
    
    if not Path(csv_path).exists():
        print(f"❌ Error: File not found: {csv_path}")
        return
    
    print(f"📊 Analyzing: {csv_path}\n")
    
    # Track unique combinations
    tournaments = defaultdict(int)  # (event_id, year) -> count
    rounds = defaultdict(int)       # (event_id, year, round_num) -> count
    player_rounds = set()           # unique (event_id, year, round_num, dg_id)
    
    # Track all data
    all_rows = []
    
    try:
        with open(csv_path, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            
            # Verify required columns exist
            if not reader.fieldnames:
                print("❌ Error: CSV appears to be empty or invalid")
                return
            
            required = ['Event_ID', 'Year', 'Round_Num', 'DG_ID']
            missing = [col for col in required if col not in reader.fieldnames]
            if missing:
                print(f"❌ Error: Missing required columns: {missing}")
                print(f"Available columns: {reader.fieldnames}")
                return
            
            for row_num, row in enumerate(reader, start=2):  # Start at 2 (after header)
                try:
                    event_id = row.get('Event_ID', '').strip()
                    year = row.get('Year', '').strip()
                    round_num = row.get('Round_Num', '').strip()
                    dg_id = row.get('DG_ID', '').strip()
                    event_name = row.get('Event_Name', 'Unknown').strip()
                    player_name = row.get('Player_Name', 'Unknown').strip()
                    
                    if not all([event_id, year, round_num, dg_id]):
                        continue  # Skip incomplete rows
                    
                    all_rows.append(row)
                    
                    # Track tournament occurrences
                    tournaments[(event_id, year, event_name)] += 1
                    
                    # Track round occurrences
                    rounds[(event_id, year, round_num, event_name)] += 1
                    
                    # Track unique player-rounds
                    player_round_key = (event_id, year, round_num, dg_id, player_name)
                    player_rounds.add(player_round_key)
                    
                except Exception as e:
                    print(f"⚠️  Warning: Error processing row {row_num}: {e}")
                    continue
        
        # Analysis Summary
        print("=" * 70)
        print("SUMMARY")
        print("=" * 70)
        print(f"Total rows processed: {len(all_rows)}")
        print(f"Unique tournaments: {len(tournaments)}")
        print(f"Unique player-rounds: {len(player_rounds)}")
        print()
        
        # Tournament breakdown
        print("=" * 70)
        print("TOURNAMENTS IN DATA")
        print("=" * 70)
        sorted_tournaments = sorted(tournaments.items(), key=lambda x: (x[0][1], x[0][0]))  # Sort by year, then event_id
        
        for (event_id, year, event_name), count in sorted_tournaments:
            print(f"{year} - {event_name} (ID: {event_id})")
            print(f"  └─ {count} rounds")
        
        print()
        
        # Check for duplicate player-rounds
        print("=" * 70)
        print("CHECKING FOR DUPLICATES")
        print("=" * 70)
        
        # Count how many times each player-round appears
        player_round_counts = defaultdict(int)
        for row in all_rows:
            event_id = row.get('Event_ID', '').strip()
            year = row.get('Year', '').strip()
            round_num = row.get('Round_Num', '').strip()
            dg_id = row.get('DG_ID', '').strip()
            player_name = row.get('Player_Name', 'Unknown').strip()
            
            if all([event_id, year, round_num, dg_id]):
                key = (event_id, year, round_num, dg_id, player_name)
                player_round_counts[key] += 1
        
        # Find duplicates
        duplicates = {k: v for k, v in player_round_counts.items() if v > 1}
        
        if duplicates:
            print(f"⚠️  Found {len(duplicates)} duplicate player-rounds:")
            print()
            for (event_id, year, round_num, dg_id, player_name), count in sorted(duplicates.items()):
                print(f"  • {year} Event {event_id}, Round {round_num}")
                print(f"    Player: {player_name} (DG ID: {dg_id})")
                print(f"    Appears {count} times ❌")
                print()
        else:
            print("✅ No duplicate player-rounds found!")
            print("   Each player's round data appears exactly once.")
        
        print()
        
        # Round distribution
        print("=" * 70)
        print("ROUNDS PER TOURNAMENT")
        print("=" * 70)
        
        tournament_rounds = defaultdict(lambda: defaultdict(int))
        for (event_id, year, round_num, event_name), count in rounds.items():
            tournament_rounds[(event_id, year, event_name)][round_num] = count
        
        for (event_id, year, event_name), round_data in sorted(tournament_rounds.items()):
            print(f"\n{year} - {event_name} (ID: {event_id}):")
            for round_num in sorted(round_data.keys()):
                count = round_data[round_num]
                print(f"  Round {round_num}: {count} entries")
        
        print()
        print("=" * 70)
        
        # Return summary
        return {
            'total_rows': len(all_rows),
            'unique_tournaments': len(tournaments),
            'unique_player_rounds': len(player_rounds),
            'duplicates': len(duplicates)
        }
        
    except Exception as e:
        print(f"❌ Error reading CSV: {e}")
        return None


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python csv_analyzer.py <path_to_csv>")
        print("Example: python csv_analyzer.py 'American Express (2026) - Historical Data.csv'")
        sys.exit(1)
    
    csv_path = sys.argv[1]
    analyze_historical_data(csv_path)
