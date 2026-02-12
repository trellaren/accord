from accord.cli import pass_environment

import click

@click.command("strum", short_help="Starts a stream window...")
@click.argument("game", required=False)
@pass_environment
def cli(ctx, game):
    """Initialize a game stream."""
    click.echo()