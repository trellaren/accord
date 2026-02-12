from accord.cli import pass_environment

import click

@click.command("status", short_help="Shows context status...")
@pass_environment
def cli(ctx):
    """Shows status for current context"""
    click.echo()